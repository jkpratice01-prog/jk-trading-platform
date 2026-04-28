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
    return {
        "contractSymbol": r["contract_symbol"],
        "strike": r["strike"],
        "lastPrice": r["last_price"],
        "bid": r["bid"],
        "ask": r["ask"],
        "volume": r["volume"],
        "openInterest": r["open_interest"],
        "impliedVolatility": r["implied_volatility"],
        "inTheMoney": bool(r["in_the_money"]),
        "delta": r["delta"],
        "expiration": int(datetime.fromisoformat(r["expiry"]).timestamp()) if r["expiry"] else None,
        "expirationLabel": r["expiry"],
        "daysToExpiry": max(0, (date.fromisoformat(r["expiry"]) - date.today()).days) if r["expiry"] else None,
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
            mid       = (bid + ask) / 2 if bid and ask else last
            breakeven = round(strike + mid, 2) if opt_type == "call" else round(strike - mid, 2)
            exp_move  = round(underlying * iv * math.sqrt(max(dte, 1) / 365), 2) if underlying and iv else None
            contracts.append({
                "type": opt_type,
                "contractSymbol": str(row.get("contractSymbol", "")),
                "strike": strike,
                "lastPrice": last,
                "bid":   bid,
                "ask":   ask,
                "mid":   round(mid, 2),
                "volume": int(row.get("volume", 0) or 0),
                "openInterest": int(row.get("openInterest", 0) or 0),
                "impliedVolatility": iv,
                "inTheMoney": bool(row.get("inTheMoney", False)),
                "delta": round(delta, 4) if delta is not None else None,
                "theta": round(theta, 5) if theta is not None else None,
                "thetaPerDay": round(theta * 100, 2) if theta else None,  # $ per contract/day
                "breakeven": breakeven,
                "expectedMove": exp_move,
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
            "totalCallOI":     total_call_oi,
            "totalPutOI":      total_put_oi,
            "totalCallVolume": total_call_vol,
            "totalPutVolume":  total_put_vol,
            "pcVolumeRatio":   round(total_put_vol / total_call_vol, 3) if total_call_vol else None,
            "pcOIRatio":       round(total_put_oi / total_call_oi, 3)   if total_call_oi  else None,
            "maxPain":         _max_pain(calls, puts, strikes),
            "unusualContracts": len(unusual),
        },
        "source": source,
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
