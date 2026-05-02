"""Options chains via yfinance, with Black-Scholes delta, SQLite cache."""
import math
from datetime import datetime, timedelta, date
import yfinance as yf
from server.db import get_db

OPTIONS_TTL = 300  # 5 minutes


def _norm_cdf(x: float) -> float:
    t = 1.0 / (1.0 + 0.2316419 * abs(x))
    d = 0.3989423 * math.exp(-x * x / 2)
    p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
    return 1 - p if x >= 0 else p


def _bs_delta(S: float, K: float, T: float, r: float, sigma: float, opt_type: str) -> float | None:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        return _norm_cdf(d1) if opt_type == "call" else _norm_cdf(d1) - 1.0
    except Exception:
        return None


def _bs_theta(S: float, K: float, T: float, r: float, sigma: float, opt_type: str) -> float | None:
    """Theta per calendar day per share (always negative for long options)."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return 0.0
    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        d2 = d1 - sigma * math.sqrt(T)
        npd1 = math.exp(-d1 ** 2 / 2) / math.sqrt(2 * math.pi)  # N'(d1)
        if opt_type == "call":
            theta = (-S * npd1 * sigma / (2 * math.sqrt(T)) - r * K * math.exp(-r * T) * _norm_cdf(d2)) / 365
        else:
            theta = (-S * npd1 * sigma / (2 * math.sqrt(T)) + r * K * math.exp(-r * T) * _norm_cdf(-d2)) / 365
        return round(theta, 5)
    except Exception:
        return None


def _bs_gamma(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """Black-Scholes gamma (same for calls and puts)."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return 0.0
    try:
        d1   = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
        npd1 = math.exp(-d1**2 / 2) / math.sqrt(2 * math.pi)
        return npd1 / (S * sigma * math.sqrt(T))
    except Exception:
        return 0.0


def _classify_trade(volume: int, oi: int, premium: float, bid: float, ask: float) -> str:
    """
    Classify an options print as sweep, block, or retail.
    Without tick data this is an approximation based on vol/OI ratio and premium.

    Block  – large negotiated single print (high premium, vol < OI)
    Sweep  – aggressive, split across venues  (vol > OI, or high vol/OI with tight spread)
    Retail – everything else
    """
    if not volume or premium is None:
        return 'retail'
    spread_pct   = (ask - bid) / bid if (bid and bid > 0) else 1.0
    vol_oi_ratio = volume / oi if oi and oi > 0 else 0
    is_large     = premium >= 500_000
    is_aggressive = vol_oi_ratio > 1.0 and spread_pct < 0.15 and volume > 50
    if is_large and not is_aggressive:
        return 'block'
    if is_aggressive or (premium >= 100_000 and vol_oi_ratio > 2.0):
        return 'sweep'
    return 'retail'


def _gex_profile(calls: list[dict], puts: list[dict], underlying: float) -> dict:
    """
    Gamma Exposure (GEX) by strike — dealer perspective.

    Dealers assumed SHORT calls, LONG puts.
    Net dealer GEX per strike = (put_gamma - call_gamma) * OI * 100 * spot
    Positive zone → dealers long gamma → price dampened (mean-reversion)
    Negative zone → dealers short gamma → price amplified (trending)
    GEX flip point = strike where cumulative GEX crosses zero.
    """
    if not underlying or underlying <= 0:
        return {}

    by_strike: dict[float, dict] = {}
    for c in calls:
        s, g, oi = c.get('strike'), c.get('gamma') or 0, c.get('openInterest') or 0
        if s:
            row = by_strike.setdefault(s, {'cGex': 0.0, 'pGex': 0.0})
            row['cGex'] += g * oi * 100 * underlying
    for p in puts:
        s, g, oi = p.get('strike'), p.get('gamma') or 0, p.get('openInterest') or 0
        if s:
            row = by_strike.setdefault(s, {'cGex': 0.0, 'pGex': 0.0})
            row['pGex'] += g * oi * 100 * underlying

    gex_rows, total = [], 0.0
    for strike in sorted(by_strike):
        d   = by_strike[strike]
        net = d['pGex'] - d['cGex']          # dealer perspective
        total += net
        gex_rows.append({
            'strike':  strike,
            'callGex': round(d['cGex'] / 1e6, 3),
            'putGex':  round(d['pGex'] / 1e6, 3),
            'netGex':  round(net / 1e6, 3),
        })

    # Flip point — where cumulative GEX sign changes
    flip, cum = None, 0.0
    for row in gex_rows:
        prev = cum
        cum  += row['netGex']
        if flip is None and prev * cum < 0:
            flip = row['strike']

    return {
        'byStrike':    gex_rows,
        'totalNetGex': round(total / 1e6, 3),
        'flipPoint':   flip,
    }


def _strike_magnets(calls: list[dict], puts: list[dict],
                    underlying: float, max_pain: float | None) -> dict:
    """
    Key strike levels:
    Call Wall   – highest-OI call strike above spot (resistance)
    Put Wall    – highest-OI put strike below spot (support)
    Gamma Pin   – strike with highest combined OI across calls + puts
    Max Pain    – where most options expire worthless (from _max_pain)
    """
    if not underlying:
        return {}

    calls_above = [c for c in calls if (c.get('strike') or 0) >= underlying]
    puts_below  = [p for p in puts  if (p.get('strike') or 0) <= underlying]

    call_wall = max(calls_above, key=lambda c: c.get('openInterest') or 0, default=None)
    put_wall  = max(puts_below,  key=lambda p: p.get('openInterest') or 0, default=None)

    combined: dict[float, int] = {}
    for c in calls:
        s = c.get('strike')
        if s: combined[s] = combined.get(s, 0) + (c.get('openInterest') or 0)
    for p in puts:
        s = p.get('strike')
        if s: combined[s] = combined.get(s, 0) + (p.get('openInterest') or 0)

    gamma_pin = max(combined, key=combined.get) if combined else None

    top_res = sorted(calls_above, key=lambda c: c.get('openInterest') or 0, reverse=True)[:4]
    top_sup = sorted(puts_below,  key=lambda p: p.get('openInterest') or 0, reverse=True)[:4]

    return {
        'callWall':   {'strike': call_wall['strike'], 'oi': call_wall.get('openInterest')} if call_wall else None,
        'putWall':    {'strike': put_wall['strike'],  'oi': put_wall.get('openInterest')}  if put_wall  else None,
        'gammaPin':   {'strike': gamma_pin, 'oi': combined.get(gamma_pin)} if gamma_pin else None,
        'maxPain':    max_pain,
        'resistance': [{'strike': c['strike'], 'oi': c.get('openInterest'), 'label': f'R{i+1}'} for i, c in enumerate(top_res)],
        'support':    [{'strike': p['strike'], 'oi': p.get('openInterest'), 'label': f'S{i+1}'} for i, p in enumerate(top_sup)],
    }


def _expiration_clusters(calls: list[dict], puts: list[dict]) -> list[dict]:
    """Group volume, OI, and premium by expiration date to show where activity clusters."""
    from collections import defaultdict
    by_exp: dict = defaultdict(lambda: {'cv': 0, 'pv': 0, 'coi': 0, 'poi': 0,
                                         'cprem': 0.0, 'pprem': 0.0, 'dte': 0})
    for c in calls:
        exp = c.get('expirationLabel', '')
        if not exp: continue
        d = by_exp[exp]
        d['cv']    += c.get('volume', 0) or 0
        d['coi']   += c.get('openInterest', 0) or 0
        d['cprem'] += (c.get('premium') or 0)
        d['dte']    = c.get('daysToExpiry', 0) or 0
    for p in puts:
        exp = p.get('expirationLabel', '')
        if not exp: continue
        d = by_exp[exp]
        d['pv']    += p.get('volume', 0) or 0
        d['poi']   += p.get('openInterest', 0) or 0
        d['pprem'] += (p.get('premium') or 0)
        d['dte']    = p.get('daysToExpiry', 0) or 0

    result = []
    for exp, d in sorted(by_exp.items()):
        dte  = d['dte']
        cat  = 'Weekly' if dte <= 7 else 'Monthly' if dte <= 45 else 'Quarterly' if dte <= 90 else 'LEAP'
        tv   = d['cv'] + d['pv']
        toi  = d['coi'] + d['poi']
        tprem= d['cprem'] + d['pprem']
        result.append({
            'expiration':   exp,
            'dte':          dte,
            'category':     cat,
            'callVol':      d['cv'],  'putVol':  d['pv'],  'totalVol':  tv,
            'callOI':       d['coi'], 'putOI':   d['poi'], 'totalOI':   toi,
            'callPremium':  round(d['cprem']), 'putPremium': round(d['pprem']),
            'totalPremium': round(tprem),
            'pcRatio':      round(d['pv'] / d['cv'], 2) if d['cv'] else None,
        })
    return sorted(result, key=lambda x: x['dte'])


def _max_pain(calls: list[dict], puts: list[dict], strikes: list[float]) -> float | None:
    if not strikes or not calls or not puts:
        return None
    min_loss, result = float("inf"), None
    for strike in strikes:
        cl = sum(max(0, strike - c["strike"]) * (c["openInterest"] or 0) for c in calls)
        pl = sum(max(0, p["strike"] - strike) * (p["openInterest"] or 0) for p in puts)
        if cl + pl < min_loss:
            min_loss = cl + pl
            result = strike
    return result


def _read_cache(symbol: str, expiry: str, conn, underlying: float | None = None) -> dict | None:
    cut = (datetime.utcnow() - timedelta(seconds=OPTIONS_TTL)).isoformat()
    count = conn.execute(
        "SELECT COUNT(*) FROM options WHERE symbol=? AND expiry=? AND fetched_at>?",
        (symbol, expiry, cut)
    ).fetchone()[0]
    if count == 0:
        return None
    rows = conn.execute(
        """SELECT * FROM options WHERE symbol=? AND expiry=?
           AND fetched_at=(SELECT MAX(fetched_at) FROM options WHERE symbol=? AND expiry=?)""",
        (symbol, expiry, symbol, expiry)
    ).fetchall()
    if not rows:
        return None

    # Validate cached strikes are within ±50% of current price.
    # If price has moved significantly since last cache, force a fresh fetch.
    if underlying and underlying > 0:
        cached_strikes = [r["strike"] for r in rows if r["strike"]]
        if cached_strikes:
            mid_strike = sorted(cached_strikes)[len(cached_strikes) // 2]
            if abs(mid_strike - underlying) / underlying > 0.50:
                return None  # stale — price moved too far, refetch

    return _rows_to_chain(symbol, expiry, [dict(r) for r in rows])


def _rows_to_chain(symbol: str, expiry: str, rows: list[dict]) -> dict:
    calls = [_row_to_contract(r) for r in rows if r["option_type"] == "call"]
    puts  = [_row_to_contract(r) for r in rows if r["option_type"] == "put"]
    strikes = sorted(set(r["strike"] for r in rows if r["strike"]))
    return _build_response(symbol, None, [expiry], expiry, calls, puts, strikes, "yfinance")


def _row_to_contract(r: dict) -> dict:
    bid = r["bid"] or 0
    ask = r["ask"] or 0
    last= r["last_price"] or 0
    mid = (bid + ask) / 2 if bid and ask else last
    vol = r["volume"] or 0
    oi  = r["open_interest"] or 0
    iv  = r["implied_volatility"] or 0
    prem= round(mid * vol * 100, 0)
    return {
        "type":           r["option_type"],            # 'call' | 'put'
        "contractSymbol": r["contract_symbol"],
        "strike":         r["strike"],
        "lastPrice":      last,
        "bid":            bid,
        "ask":            ask,
        "mid":            round(mid, 2),
        "volume":         vol,
        "openInterest":   oi,
        "impliedVolatility": iv,
        "inTheMoney":     bool(r["in_the_money"]),
        "delta":          r["delta"],
        "premium":        prem,
        "tradeType":      _classify_trade(vol, oi, prem, bid, ask),
        "expiration":     int(datetime.fromisoformat(r["expiry"]).timestamp()) if r["expiry"] else None,
        "expirationLabel": r["expiry"],
        "daysToExpiry":   max(0, (date.fromisoformat(r["expiry"]) - date.today()).days) if r["expiry"] else None,
    }


def _save_chain(symbol: str, expiry: str, contracts: list[dict], conn):
    now = datetime.utcnow().isoformat()
    for c in contracts:
        conn.execute(
            """INSERT INTO options
               (symbol,expiry,option_type,contract_symbol,strike,last_price,bid,ask,
                volume,open_interest,implied_volatility,in_the_money,delta,fetched_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (symbol, expiry, c["type"], c.get("contractSymbol"), c.get("strike"),
             c.get("lastPrice"), c.get("bid"), c.get("ask"),
             c.get("volume"), c.get("openInterest"), c.get("impliedVolatility"),
             1 if c.get("inTheMoney") else 0, c.get("delta"), now)
        )
    conn.commit()


def _df_to_contracts(df, opt_type: str, underlying: float, expiry_date: date) -> list[dict]:
    contracts = []
    T = max(0.0001, (expiry_date - date.today()).days / 365.0)
    for _, row in df.iterrows():
        try:
            strike    = float(row["strike"])
            iv        = float(row.get("impliedVolatility", 0) or 0)
            last      = float(row.get("lastPrice", 0) or 0)
            bid       = float(row.get("bid", 0) or 0)
            ask       = float(row.get("ask", 0) or 0)
            dte       = max(0, (expiry_date - date.today()).days)
            delta     = _bs_delta(underlying, strike, T, 0.05, iv, opt_type) if underlying and iv > 0 else None
            theta     = _bs_theta(underlying, strike, T, 0.05, iv, opt_type) if underlying and iv > 0 else None
            gamma     = _bs_gamma(underlying, strike, T, 0.05, iv)            if underlying and iv > 0 else 0.0
            mid       = (bid + ask) / 2 if bid and ask else last
            breakeven = round(strike + mid, 2) if opt_type == "call" else round(strike - mid, 2)
            exp_move  = round(underlying * iv * math.sqrt(max(dte, 1) / 365), 2) if underlying and iv else None
            vol_int   = int(row.get("volume", 0) or 0)
            oi_int    = int(row.get("openInterest", 0) or 0)
            premium   = round(mid * vol_int * 100, 0)
            trade_type = _classify_trade(vol_int, oi_int, premium, bid, ask)
            contracts.append({
                "type": opt_type,
                "contractSymbol": str(row.get("contractSymbol", "")),
                "strike": strike,
                "lastPrice": last,
                "bid":   bid,
                "ask":   ask,
                "mid":   round(mid, 2),
                "volume": vol_int,
                "openInterest": oi_int,
                "impliedVolatility": iv,
                "inTheMoney": bool(row.get("inTheMoney", False)),
                "delta":      round(delta, 4)  if delta is not None else None,
                "theta":      round(theta, 5)  if theta is not None else None,
                "gamma":      round(gamma, 6)  if gamma else None,
                "thetaPerDay": round(theta * 100, 2) if theta else None,
                "breakeven":  breakeven,
                "expectedMove": exp_move,
                "premium":    premium,
                "tradeType":  trade_type,
                "expiration": int(datetime(expiry_date.year, expiry_date.month, expiry_date.day).timestamp()),
                "expirationLabel": expiry_date.isoformat(),
                "daysToExpiry": dte,
            })
        except Exception:
            pass
    return contracts


def _build_response(symbol, underlying, expiry_dates, selected_expiry,
                    calls, puts, strikes, source="yfinance") -> dict:
    total_call_oi  = sum(c.get("openInterest", 0) or 0 for c in calls)
    total_put_oi   = sum(p.get("openInterest", 0) or 0 for p in puts)
    total_call_vol = sum(c.get("volume", 0) or 0 for c in calls)
    total_put_vol  = sum(p.get("volume", 0) or 0 for p in puts)
    unusual = [
        c for c in calls + puts
        if (c.get("volume") or 0) > 0 and (c.get("openInterest") or 0) > 0
        and (c.get("volume", 0) / max(c.get("openInterest", 1), 1)) > 1.5
        and (c.get("volume") or 0) > 50
    ]
    # Sort unusual by premium descending; tag sweeps/blocks
    unusual_sorted = sorted(unusual, key=lambda c: c.get("premium") or 0, reverse=True)

    max_pain_val = _max_pain(calls, puts, strikes)
    gex          = _gex_profile(calls, puts, underlying) if underlying else {}
    magnets      = _strike_magnets(calls, puts, underlying, max_pain_val) if underlying else {}
    clusters     = _expiration_clusters(calls, puts)

    return {
        "symbol": symbol,
        "underlyingPrice": underlying,
        "expirationDates":  [int(datetime.fromisoformat(d).timestamp()) if isinstance(d, str) else d for d in (expiry_dates or [])],
        "expirationLabels": expiry_dates or [],
        "selectedExpiry":   selected_expiry,
        "strikes":          sorted(strikes),
        "calls":            sorted(calls, key=lambda c: c.get("strike", 0)),
        "puts":             sorted(puts,  key=lambda p: p.get("strike", 0)),
        "summary": {
            "totalCallOI":       total_call_oi,
            "totalPutOI":        total_put_oi,
            "totalCallVolume":   total_call_vol,
            "totalPutVolume":    total_put_vol,
            "pcVolumeRatio":     round(total_put_vol / total_call_vol, 3) if total_call_vol else None,
            "pcOIRatio":         round(total_put_oi  / total_call_oi,  3) if total_call_oi  else None,
            "maxPain":           max_pain_val,
            "unusualContracts":  len(unusual),
            "sweepCount":        sum(1 for c in unusual if c.get("tradeType") == "sweep"),
            "blockCount":        sum(1 for c in unusual if c.get("tradeType") == "block"),
        },
        "gex":       gex,
        "magnets":   magnets,
        "clusters":  clusters,
        "unusual":   unusual_sorted[:40],
        "source":    source,
        "sourceLabel": "yfinance (real data)" if source == "yfinance" else source,
    }


def get_options_chain(symbol: str, expiry: str | None = None, force_save: bool = False) -> dict | None:
    symbol = symbol.upper()
    conn   = get_db()
    try:
        ticker = yf.Ticker(symbol)
        info   = ticker.fast_info
        underlying = float(info.last_price) if info.last_price else None

        expirations = list(ticker.options)
        if not expirations:
            return None

        selected = expiry if expiry in expirations else expirations[0]

        # Check cache — skip if force_save so we always get a fresh DB snapshot
        if not force_save:
            cached = _read_cache(symbol, selected, conn, underlying)
            if cached:
                cached["underlyingPrice"] = underlying
                cached["expirationLabels"] = expirations
                return cached

        # Fetch fresh from yfinance
        chain = ticker.option_chain(selected)
        exp_date = date.fromisoformat(selected)

        calls_raw = _df_to_contracts(chain.calls, "call", underlying, exp_date)
        puts_raw  = _df_to_contracts(chain.puts,  "put",  underlying, exp_date)

        # Always save a new snapshot to DB (used by history chart)
        _save_chain(symbol, selected, calls_raw + puts_raw, conn)

        strikes = sorted(set(c["strike"] for c in calls_raw + puts_raw))
        return _build_response(symbol, underlying, expirations, selected,
                               calls_raw, puts_raw, strikes, "yfinance")
    except Exception as e:
        print(f"[options] {symbol}: {e}")
        return None
    finally:
        conn.close()
