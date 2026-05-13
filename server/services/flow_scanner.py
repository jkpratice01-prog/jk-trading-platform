"""Market-wide unusual options flow scanner."""
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, date

# Reuse BS math from options.py — no duplication
from server.services.options import _bs_delta, _bs_theta, _bs_vega, _classify_trade

SCAN_UNIVERSE = list(dict.fromkeys([
    # Mega-cap / index
    'SPY', 'QQQ', 'IWM', 'DIA',
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'AMD',
    # Semis / AI
    'AVGO', 'QCOM', 'MU', 'AMAT', 'LRCX', 'ARM', 'SMCI', 'PLTR', 'MRVL',
    # Cloud / Cyber
    'SNOW', 'DDOG', 'NET', 'CRWD', 'PANW', 'CRM', 'NOW', 'ORCL',
    # Finance
    'JPM', 'GS', 'BAC', 'V', 'MA', 'COIN', 'BLK',
    # Healthcare
    'LLY', 'UNH', 'ABBV', 'MRNA', 'ISRG',
    # Consumer / Streaming
    'NFLX', 'UBER', 'SHOP', 'COST', 'WMT',
    # Energy
    'XOM', 'CVX', 'OXY',
    # Sector ETFs
    'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLC', 'SMH',
    # High-growth / momentum
    'MSTR', 'APP', 'TTD', 'HOOD', 'SOFI', 'AFRM', 'UPST',
]))


def _moneyness(spot: float, strike: float, opt_type: str) -> str:
    pct = (strike - spot) / spot * 100
    if opt_type == 'call':
        if pct < -10:  return 'Deep ITM'
        if pct < -1:   return 'ITM'
        if pct <= 1:   return 'ATM'
        if pct <= 10:  return 'OTM'
        return                'Deep OTM'
    else:
        if pct > 10:   return 'Deep ITM'
        if pct > 1:    return 'ITM'
        if pct >= -1:  return 'ATM'
        if pct >= -10: return 'OTM'
        return                'Deep OTM'


def _next_earnings(yf_ticker) -> dict | None:
    """Fetch next earnings date once per ticker."""
    try:
        ed = yf_ticker.earnings_dates
        if ed is None or ed.empty:
            return None
        now    = pd.Timestamp.now(tz='UTC')
        future = ed[ed.index.normalize() >= now.normalize()]
        if future.empty:
            return None
        dt        = future.index[-1]
        earn_date = dt.date()
        return {'date': earn_date.strftime('%Y-%m-%d'), 'daysAway': max(0, (earn_date - date.today()).days), '_date': earn_date}
    except Exception:
        return None


def _smart_money_score(vol_oi: float, otm: bool, earnings_before: bool,
                       premium: int, is_leaps: bool) -> int:
    """
    0–5 composite signal. Higher = more likely to be informed/institutional.
      1 pt — Vol/OI ≥ 5× (exceptional unusual activity)
      1 pt — OTM (speculative directional bet, not a hedge)
      1 pt — Earnings falls before expiry (catalyst play)
      1 pt — Premium ≥ $100K (institutional size)
      1 pt — LEAPS (≥ 180 DTE) — smart money buys time when confident
    """
    return sum([vol_oi >= 5.0, otm, earnings_before, premium >= 100_000, is_leaps])


def _scan_ticker(sym: str, underlying: float, earnings: dict | None) -> list[dict]:
    """
    Scan one ticker across up to 6 expiries.
    Uses yf_session ticker for rate-limit resilience across all calls.
    Earnings is pre-fetched once per stock by the caller.
    """
    try:
        from server.services.yf_session import ticker as yf_ticker
        t    = yf_ticker(sym)
        exps = t.options
        if not exps:
            return []

        results = []
        for exp in exps[:6]:
            try:
                expiry_date  = date.fromisoformat(exp)
                dte          = max(1, (expiry_date - date.today()).days)
                T            = dte / 365.0
                is_leaps     = dte >= 180
                earn_before  = earnings is not None and earnings['_date'] <= expiry_date

                chain = t.option_chain(exp)
            except Exception:
                continue

            for df, opt_type in [(chain.calls, 'call'), (chain.puts, 'put')]:
                for _, row in df.iterrows():
                    vol = int(row.get('volume', 0) or 0)
                    oi  = int(row.get('openInterest', 0) or 0)
                    if vol < 50 or oi < 50:
                        continue
                    ratio = vol / max(oi, 1)
                    if ratio < 2.0:
                        continue

                    strike = float(row['strike'])
                    iv     = float(row.get('impliedVolatility', 0) or 0)
                    bid    = float(row.get('bid', 0) or 0)
                    ask    = float(row.get('ask', 0) or 0)
                    mid    = (bid + ask) / 2 if bid and ask else float(row.get('lastPrice', 0) or 0)
                    if mid <= 0:
                        continue

                    delta      = _bs_delta(underlying, strike, T, 0.052, iv, opt_type)
                    theta      = _bs_theta(underlying, strike, T, 0.052, iv, opt_type)
                    vega       = _bs_vega(underlying, strike, T, 0.052, iv)
                    prem       = round(mid * vol * 100)
                    itm        = (opt_type == 'call' and strike < underlying) or \
                                 (opt_type == 'put'  and strike > underlying)
                    mon        = _moneyness(underlying, strike, opt_type)
                    otm        = 'OTM' in mon
                    trade_type = _classify_trade(vol, oi, mid, bid, ask)
                    score      = _smart_money_score(ratio, otm, earn_before, prem, is_leaps)

                    results.append({
                        'symbol':           sym,
                        'contractSymbol':   str(row.get('contractSymbol', '')),
                        'type':             opt_type,
                        'strike':           strike,
                        'expiry':           exp,
                        'daysToExpiry':     dte,
                        'isLeaps':          is_leaps,
                        'bid':              round(bid, 2),
                        'ask':              round(ask, 2),
                        'mid':              round(mid, 2),
                        'volume':           vol,
                        'openInterest':     oi,
                        'volOiRatio':       round(ratio, 2),
                        'impliedVolatility': round(iv * 100, 1),
                        'delta':            round(delta, 3)       if delta is not None else None,
                        'thetaDay':         round(theta * 100, 2) if theta is not None else None,
                        'vegaPct':          round(vega  * 100, 2) if vega  is not None else None,
                        'premium':          prem,
                        'itm':              itm,
                        'moneyness':        mon,
                        'tradeType':        trade_type,
                        'sentiment':        'bullish' if opt_type == 'call' else 'bearish',
                        'smartScore':       score,
                        'earnings':         {'date': earnings['date'], 'daysAway': earnings['daysAway']} if earnings else None,
                        'earningsBeforeExpiry': earn_before,
                    })
        return results
    except Exception:
        return []


def scan_unusual_flow(min_ratio: float = 2.0, limit: int = 100) -> dict:
    all_flow = []

    def _worker(sym):
        try:
            from server.services.yf_session import ticker as yf_ticker
            t     = yf_ticker(sym)
            price = t.fast_info.last_price
            if not price:
                return []
            # Fetch earnings once per stock here (not inside the expiry loop)
            earnings = _next_earnings(t)
            return _scan_ticker(sym, float(price), earnings)
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(_worker, s): s for s in SCAN_UNIVERSE}
        for fut in as_completed(futures, timeout=90):
            try:
                all_flow.extend(fut.result() or [])
            except Exception:
                pass

    # Sort: smart-money score first, then by premium
    all_flow.sort(key=lambda x: (-x['smartScore'], -x['premium']))

    # Per-symbol bias summary
    sym_prems: dict = {}
    for f in all_flow:
        s = f['symbol']
        if s not in sym_prems:
            sym_prems[s] = {'call': 0, 'put': 0}
        sym_prems[s][f['type']] += f['premium']

    symbol_bias = {}
    for s, prems in sym_prems.items():
        cp, pp   = prems['call'], prems['put']
        total    = cp + pp
        call_pct = round(cp / total * 100) if total else 50
        bias     = 'BULLISH' if call_pct >= 65 else ('BEARISH' if call_pct <= 35 else 'MIXED')
        symbol_bias[s] = {'bias': bias, 'callPct': call_pct, 'callPremium': cp, 'putPremium': pp}

    for f in all_flow:
        sb = symbol_bias.get(f['symbol'], {})
        f['symbolBias']  = sb.get('bias', 'MIXED')
        f['callPct']     = sb.get('callPct', 50)
        f['callPremSym'] = sb.get('callPremium', 0)
        f['putPremSym']  = sb.get('putPremium', 0)

    return {
        'flow':          all_flow[:limit],
        'symbolBias':    symbol_bias,
        'scannedAt':     datetime.utcnow().isoformat(),
        'total':         len(all_flow),
        'totalSymbols':  len(symbol_bias),
    }