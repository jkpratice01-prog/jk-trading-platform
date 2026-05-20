"""Options chains via yfinance, with Black-Scholes delta, SQLite cache."""
import math
from datetime import datetime, timedelta, date
import pandas as pd
import yfinance as yf
from server.db import get_db

OPTIONS_TTL = 900  # 15 minutes — reduces cold yfinance fetches on Railway


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


def _bs_vega(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """Vega: option price change per +1% IV move, per share."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return 0.0
    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
        npd1 = math.exp(-d1**2 / 2) / math.sqrt(2 * math.pi)
        return round(S * npd1 * math.sqrt(T) / 100, 5)
    except Exception:
        return 0.0


def _bs_price(S: float, K: float, T: float, r: float, sigma: float, opt_type: str) -> float:
    """Black-Scholes theoretical price per share."""
    if S <= 0 or K <= 0 or sigma <= 0 or T <= 0:
        return max(0.0, (S - K) if opt_type == 'call' else (K - S))
    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
        d2 = d1 - sigma * math.sqrt(T)
        if opt_type == 'call':
            price = S * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)
        else:
            price = K * math.exp(-r * T) * _norm_cdf(-d2) - S * _norm_cdf(-d1)
        return max(0.0, round(price, 4))
    except Exception:
        return 0.0


def _get_next_earnings(ticker, expiry_date: date) -> dict | None:
    """
    Return the next earnings date relative to today, with context about
    whether it falls before or after the option's expiry.
    """
    try:
        ed = ticker.earnings_dates
        if ed is None or ed.empty:
            return None
        now = pd.Timestamp.now(tz='UTC')
        # earnings_dates is sorted descending — grab all future dates
        future = ed[ed.index.normalize() >= now.normalize()]
        if future.empty:
            return None
        # Last entry in descending list = nearest upcoming date
        dt = future.index[-1]
        earnings_dt = dt.date()
        days_away   = max(0, (earnings_dt - date.today()).days)
        before_expiry = earnings_dt <= expiry_date

        # Expected move: IV-derived 1-sigma move over the earnings window
        # e_move = IV * sqrt(days_to_earnings / 365)
        return {
            'date':          earnings_dt.strftime('%Y-%m-%d'),
            'daysAway':      days_away,
            'beforeExpiry':  before_expiry,
        }
    except Exception:
        return None


def decode_contract(symbol: str, strike: float, opt_type: str, expiry_str: str) -> dict:
    """
    Full breakdown of a single options contract.
    Returns current market values, all Greeks, and a price×time scenario matrix
    so the user can see what the option is worth at any future price/date.
    """
    from datetime import date as date_cls

    t = yf.Ticker(symbol)
    try:
        spot = float(t.fast_info.last_price)
        if not spot or spot <= 0:
            return {'error': f'Could not fetch price for {symbol}'}
    except Exception:
        return {'error': f'Could not fetch price for {symbol}'}

    try:
        expiry_dt = datetime.strptime(expiry_str, '%Y-%m-%d').date()
    except ValueError:
        return {'error': f'Invalid expiry: {expiry_str}'}

    today     = date_cls.today()
    days_left = max(0, (expiry_dt - today).days)
    T         = days_left / 365.0
    r         = 0.052  # approx risk-free rate

    # Earnings — fetch before the options chain call (same ticker object)
    earnings = _get_next_earnings(t, expiry_dt)

    # Try to get real market IV, price, volume from the chain
    iv = 0.25
    market_price = None
    volume = oi = 0
    bid = ask = None

    try:
        chain = t.option_chain(expiry_str)
        df = chain.calls if opt_type == 'call' else chain.puts
        match = df[abs(df['strike'] - strike) < 0.01]
        if not match.empty:
            row = match.iloc[0]
            raw_iv = row.get('impliedVolatility')
            if raw_iv and float(raw_iv) > 0:
                iv = float(raw_iv)
            lp = row.get('lastPrice')
            if lp and float(lp) > 0:
                market_price = float(lp)
            volume = int(row.get('volume') or 0)
            oi     = int(row.get('openInterest') or 0)
            b, a   = row.get('bid'), row.get('ask')
            bid    = float(b) if b else None
            ask    = float(a) if a else None
    except Exception:
        pass

    bs_val  = _bs_price(spot, strike, T, r, iv, opt_type)
    eff_prc = market_price if market_price else bs_val

    delta = _bs_delta(spot, strike, T, r, iv, opt_type)
    theta = _bs_theta(spot, strike, T, r, iv, opt_type)
    gamma = _bs_gamma(spot, strike, T, r, iv)
    vega  = _bs_vega(spot, strike, T, r, iv)

    # Moneyness
    if opt_type == 'call':
        itm = spot > strike
        pct_to_strike = (strike - spot) / spot * 100   # positive = needs to go up
    else:
        itm = spot < strike
        pct_to_strike = (spot - strike) / spot * 100

    moneyness = 'ATM' if abs(pct_to_strike) < 1 else ('ITM' if itm else 'OTM')
    breakeven = (strike + eff_prc) if opt_type == 'call' else (strike - eff_prc)

    # ── Scenario matrix ──────────────────────────────────────────────────────
    # Columns: price range covering current spot and the strike
    lo   = min(spot * 0.60, strike * 0.85)
    hi   = max(spot * 1.60, strike * 1.15)
    step = (hi - lo) / 10
    raw  = [lo + i * step for i in range(12)]
    spot_cols = sorted(set([round(p / 5) * 5 for p in raw] + [int(strike)]))

    # Rows: time slices from now → expiry
    fracs = ([1.0, 0.66, 0.33, 0.1, 0.0] if days_left > 30 else [1.0, 0.5, 0.1, 0.0])
    seen, time_rows = set(), []
    for frac in fracs:
        d = max(0, int(days_left * frac))
        if d in seen:
            continue
        seen.add(d)
        time_rows.append({'label': 'At expiry' if d == 0 else f'{d}d left', 'days': d, 'T': d / 365.0})

    matrix = []
    for tr in time_rows:
        cells = []
        for sp in spot_cols:
            op  = _bs_price(sp, strike, tr['T'], r, iv, opt_type)
            pnl = round((op - eff_prc) * 100, 2)
            cells.append({'spot': sp, 'price': round(op, 2), 'value': round(op * 100, 2), 'pnl': pnl})
        matrix.append({'label': tr['label'], 'days': tr['days'], 'cells': cells})

    return {
        'symbol':       symbol.upper(),
        'strike':       strike,
        'optType':      opt_type,
        'expiry':       expiry_str,
        'daysLeft':     days_left,
        'spot':         round(spot, 2),
        'moneyness':    moneyness,
        'pctToStrike':  round(pct_to_strike, 1),
        'premium':      round(eff_prc, 2),
        'marketPrice':  round(market_price, 2) if market_price else None,
        'bsPrice':      round(bs_val, 2),
        'iv':           round(iv * 100, 1),
        'bid':          round(bid, 2) if bid else None,
        'ask':          round(ask, 2) if ask else None,
        'breakeven':    round(breakeven, 2),
        'breakevenPct': round((breakeven - spot) / spot * 100, 1),
        'volume':       volume,
        'openInterest': oi,
        # Greeks per share (standard broker convention — matches Robinhood/TastyTrade display)
        'delta':        round(delta, 4)   if delta is not None else None,
        'thetaDay':     round(theta, 4)   if theta is not None else None,
        'gammaPoint':   round(gamma, 6)   if gamma is not None else None,
        'vegaPct':      round(vega, 5)    if vega  is not None else None,
        'spotCols':     spot_cols,
        'matrix':       matrix,
        # Earnings context
        'earnings':     earnings,
        # Expected move: IV-implied ±1σ move from now to earnings (as % of spot)
        'expectedMovePct': round(iv * math.sqrt(max(earnings['daysAway'], 1) / 365) * 100, 1)
                           if earnings else None,
    }


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

    today = date.today()

    def _get_gamma(contract: dict) -> float:
        """Use stored gamma or compute from IV (works for both fresh + cached data)."""
        g = contract.get('gamma')
        if g:
            return float(g)
        iv  = float(contract.get('impliedVolatility') or 0)
        exp = contract.get('expirationLabel') or ''
        s   = float(contract.get('strike') or 0)
        if not (iv > 0 and exp and s > 0):
            return 0.0
        try:
            T = max(0.0001, (date.fromisoformat(str(exp)[:10]) - today).days / 365.0)
            return _bs_gamma(underlying, s, T, 0.05, iv)
        except Exception:
            return 0.0

    by_strike: dict[float, dict] = {}
    for c in calls:
        s, oi = c.get('strike'), c.get('openInterest') or 0
        g = _get_gamma(c)
        if s and oi:
            row = by_strike.setdefault(s, {'cGex': 0.0, 'pGex': 0.0})
            row['cGex'] += g * oi * 100 * underlying
    for p in puts:
        s, oi = p.get('strike'), p.get('openInterest') or 0
        g = _get_gamma(p)
        if s and oi:
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


def _gamma_squeeze(gex: dict, magnets: dict, summary: dict, underlying: float | None) -> dict:
    """
    Gamma Squeeze Score (0–100).

    A gamma squeeze occurs when dealers are net-short gamma and forced to
    continuously buy (call squeeze) or sell (put squeeze) the underlying to
    delta-hedge, amplifying the move into a feedback loop.

    Scoring factors:
      • Negative net GEX          → dealers short gamma, moves amplify (up to 35 pts)
      • Call wall proximity       → price approaching / breaking dealer resistance (20 pts)
      • Call vs put dominance     → aggressive call buying pressure (20 pts)
      • Sweep count               → institutional urgency signals (15 pts)
      • Premium imbalance         → dollar commitment to direction (10 pts)
    """
    if not underlying:
        return {}

    score   = 0
    signals = []
    net_gex = (gex.get('totalNetGex') or 0)
    flip    = gex.get('flipPoint')

    # ── 1. GEX condition (0–35 pts) ─────────────────────────────────────────
    if net_gex < -100:
        score += 35; signals.append('🔴 Extreme negative GEX — dealers VERY short gamma')
    elif net_gex < -40:
        score += 25; signals.append('🟠 Negative GEX — dealers short gamma, moves amplify')
    elif net_gex < 0:
        score += 12; signals.append('🟡 Slightly negative GEX — mild amplification')
    else:
        signals.append('🟢 Positive GEX — dealers long gamma, moves dampened')

    if flip:
        dist_flip = (underlying - flip) / underlying * 100
        if abs(dist_flip) < 2:
            score += 8; signals.append(f'⚡ Price at GEX flip point (${flip}) — volatility inflection zone')
        elif dist_flip > 0:
            signals.append(f'📍 Price above GEX flip (${flip}) — negative gamma territory')
        else:
            signals.append(f'📍 Price below GEX flip (${flip}) — positive gamma territory')

    # ── 2. Call wall proximity (0–20 pts) ──────────────────────────────────
    call_wall = magnets.get('callWall') or {}
    put_wall  = magnets.get('putWall')  or {}
    if call_wall.get('strike'):
        dist = (call_wall['strike'] - underlying) / underlying * 100
        if dist < 0:
            score += 20; signals.append(f'🔥 Price ABOVE call wall ${call_wall["strike"]} — gamma squeeze ACTIVE')
        elif dist < 1.5:
            score += 18; signals.append(f'🚨 Within 1.5% of call wall ${call_wall["strike"]} — imminent squeeze')
        elif dist < 3:
            score += 12; signals.append(f'⚠️  Approaching call wall ${call_wall["strike"]} ({dist:.1f}% away)')
        elif dist < 5:
            score += 5;  signals.append(f'📊 Call wall ${call_wall["strike"]} at {dist:.1f}%')

    # ── 3. Call/put dominance (0–20 pts) ────────────────────────────────────
    pc = summary.get('pcVolumeRatio') or 1
    if pc < 0.25:
        score += 20; signals.append(f'📈 Extreme call dominance P/C={pc:.2f} — heavy upside bets')
    elif pc < 0.50:
        score += 14; signals.append(f'📈 Strong call buying P/C={pc:.2f}')
    elif pc < 0.75:
        score += 7;  signals.append(f'📈 Mild call bias P/C={pc:.2f}')
    elif pc > 2.0:
        signals.append(f'📉 Heavy put pressure P/C={pc:.2f} — possible downside squeeze')

    # ── 4. Sweep urgency (0–15 pts) ─────────────────────────────────────────
    sweeps = summary.get('sweepCount') or 0
    if sweeps >= 15:
        score += 15; signals.append(f'⚡ {sweeps} sweeps — aggressive institutional positioning')
    elif sweeps >= 8:
        score += 10; signals.append(f'⚡ {sweeps} sweeps detected')
    elif sweeps >= 3:
        score += 5;  signals.append(f'⚡ {sweeps} sweeps — moderate activity')

    # ── 5. Premium imbalance (0–10 pts) ─────────────────────────────────────
    call_prem = summary.get('totalCallVolume', 0) or 0
    put_prem  = summary.get('totalPutVolume',  0) or 0
    total_vol = call_prem + put_prem
    if total_vol > 0:
        call_share = call_prem / total_vol
        if call_share > 0.75:
            score += 10; signals.append(f'💰 {call_share*100:.0f}% of volume in calls')
        elif call_share > 0.60:
            score += 5;  signals.append(f'💰 {call_share*100:.0f}% call-weighted volume')

    score = min(score, 100)
    label = ('EXTREME SQUEEZE RISK' if score >= 75 else
             'HIGH SQUEEZE RISK'    if score >= 55 else
             'MODERATE RISK'        if score >= 35 else
             'LOW RISK'             if score >= 15 else 'NO SQUEEZE')
    color = ('#ef4444' if score >= 75 else '#f97316' if score >= 55 else
             '#fbbf24' if score >= 35 else '#86efac' if score >= 15 else '#22c55e')

    return {
        'score':   score,
        'label':   label,
        'color':   color,
        'signals': signals,
        'netGex':  net_gex,
        'flipPoint': flip,
    }


def _directional_sweeps(unusual: list[dict], underlying: float | None) -> dict:
    """
    Split sweeps into UPSIDE (bullish calls OTM above price) and
    DOWNSIDE (bearish puts OTM below price). Shows where big money is
    betting directionally.
    """
    upside, downside = [], []

    for o in unusual:
        if o.get('tradeType') not in ('sweep', 'block'):
            continue
        opt_type = (o.get('type') or '').lower()
        strike   = o.get('strike') or 0
        premium  = o.get('premium') or 0
        dte      = o.get('daysToExpiry') or 999

        if not premium or not strike or not underlying:
            continue

        is_call = opt_type == 'call'
        is_put  = opt_type == 'put'

        if is_call and strike >= underlying:          # OTM / ATM call → bullish
            pct_otm = round((strike - underlying) / underlying * 100, 1)
            upside.append({**o, 'direction': 'UPSIDE', 'pctOTM': pct_otm})
        elif is_put and strike <= underlying:         # OTM / ATM put → bearish
            pct_otm = round((underlying - strike) / underlying * 100, 1)
            downside.append({**o, 'direction': 'DOWNSIDE', 'pctOTM': pct_otm})

    upside.sort(  key=lambda x: x.get('premium', 0), reverse=True)
    downside.sort(key=lambda x: x.get('premium', 0), reverse=True)

    up_prem   = sum(x.get('premium', 0) for x in upside)
    down_prem = sum(x.get('premium', 0) for x in downside)
    total     = up_prem + down_prem or 1

    bias = ('BULLISH' if up_prem > down_prem * 1.5 else
            'BEARISH' if down_prem > up_prem * 1.5 else 'NEUTRAL')

    return {
        'upside':        upside[:12],
        'downside':      downside[:12],
        'upsideCount':   len(upside),
        'downsideCount': len(downside),
        'upsidePremium': round(up_prem),
        'downsidePremium': round(down_prem),
        'upsidePct':     round(up_prem / total * 100),
        'downsidePct':   round(down_prem / total * 100),
        'bias':          bias,
    }


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

    return _rows_to_chain(symbol, expiry, [dict(r) for r in rows], underlying)


def _rows_to_chain(symbol: str, expiry: str, rows: list[dict], underlying: float | None = None) -> dict:
    calls = [_row_to_contract(r) for r in rows if r["option_type"] == "call"]
    puts  = [_row_to_contract(r) for r in rows if r["option_type"] == "put"]
    strikes = sorted(set(r["strike"] for r in rows if r["strike"]))
    return _build_response(symbol, underlying, [expiry], expiry, calls, puts, strikes, "yfinance")


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
    gex          = _gex_profile(calls, puts, underlying)     if underlying else {}
    magnets      = _strike_magnets(calls, puts, underlying, max_pain_val) if underlying else {}
    clusters     = _expiration_clusters(calls, puts)

    summary = {
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
    }

    squeeze    = _gamma_squeeze(gex, magnets, summary, underlying)
    dir_sweeps = _directional_sweeps(unusual_sorted, underlying)

    return {
        "symbol": symbol,
        "underlyingPrice": underlying,
        "expirationDates":  [int(datetime.fromisoformat(d).timestamp()) if isinstance(d, str) else d for d in (expiry_dates or [])],
        "expirationLabels": expiry_dates or [],
        "selectedExpiry":   selected_expiry,
        "strikes":          sorted(strikes),
        "calls":            sorted(calls, key=lambda c: c.get("strike", 0)),
        "puts":             sorted(puts,  key=lambda p: p.get("strike", 0)),
        "summary": summary,
        "gex":          gex,
        "magnets":      magnets,
        "clusters":     clusters,
        "squeeze":      squeeze,
        "dirSweeps":    dir_sweeps,
        "unusual":      unusual_sorted[:40],
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
