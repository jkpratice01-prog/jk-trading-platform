"""Market-wide unusual options flow scanner."""
import yfinance as yf
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, date

SCAN_UNIVERSE = list(dict.fromkeys([
    'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','PLTR','COIN',
    'JPM','BAC','GS','V','MA','XOM','CVX','OXY','LLY','MRNA',
    'NFLX','CRM','SNOW','DDOG','NET','CRWD','SHOP','SQ','MSTR',
    'SPY','QQQ','IWM','DIA','XLK','XLF','XLE','XLV',
    'INTC','QCOM','AVGO','MU','TSM',
    'UBER','ABNB','BKNG','HOOD','SOFI','AFRM','UPST',
]))


def _norm_cdf(x):
    t = 1.0 / (1.0 + 0.2316419 * abs(x))
    d = 0.3989423 * math.exp(-x*x/2)
    p = d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))))
    return 1-p if x >= 0 else p


def _bs_delta(S, K, T, sigma, opt_type):
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d1 = (math.log(S/K) + (0.05 + 0.5*sigma**2)*T) / (sigma*math.sqrt(T))
        return _norm_cdf(d1) if opt_type == 'call' else _norm_cdf(d1) - 1.0
    except Exception:
        return None


def _scan_ticker(sym: str, underlying: float) -> list[dict]:
    try:
        t    = yf.Ticker(sym)
        exps = t.options
        if not exps:
            return []

        # Look at nearest 2 expiries
        results = []
        for exp in exps[:2]:
            chain = t.option_chain(exp)
            dte   = max(1, (date.fromisoformat(exp) - date.today()).days)
            T     = dte / 365.0

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
                    delta  = _bs_delta(underlying, strike, T, iv, opt_type)
                    prem   = round(mid * vol * 100)

                    results.append({
                        'symbol':          sym,
                        'contractSymbol':  str(row.get('contractSymbol', '')),
                        'type':            opt_type,
                        'strike':          strike,
                        'expiry':          exp,
                        'daysToExpiry':    dte,
                        'bid':             round(bid, 2),
                        'ask':             round(ask, 2),
                        'mid':             round(mid, 2),
                        'volume':          vol,
                        'openInterest':    oi,
                        'volOiRatio':      round(ratio, 2),
                        'impliedVolatility': round(iv * 100, 1),
                        'delta':           round(delta, 3) if delta else None,
                        'premium':         prem,
                        'itm':             (opt_type == 'call' and strike < underlying) or (opt_type == 'put' and strike > underlying),
                        'sentiment':       'bullish' if opt_type == 'call' else 'bearish',
                    })
        return results
    except Exception:
        return []


def scan_unusual_flow(min_ratio: float = 2.0, limit: int = 50) -> dict:
    all_flow = []

    def _worker(sym):
        try:
            t = yf.Ticker(sym)
            price = t.fast_info.last_price
            if not price:
                return []
            return _scan_ticker(sym, float(price))
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_worker, s): s for s in SCAN_UNIVERSE}
        for fut in as_completed(futures, timeout=60):
            all_flow.extend(fut.result() or [])

    all_flow.sort(key=lambda x: x['premium'], reverse=True)

    # ── Per-symbol bias: aggregate call vs put premium ────────────────────────
    sym_prems: dict = {}
    for f in all_flow:
        s = f['symbol']
        if s not in sym_prems:
            sym_prems[s] = {'call': 0, 'put': 0}
        sym_prems[s][f['type']] += f['premium']

    symbol_bias = {}
    for s, prems in sym_prems.items():
        cp, pp = prems['call'], prems['put']
        total  = cp + pp
        call_pct = round(cp / total * 100) if total else 50
        if call_pct >= 65:
            bias = 'BULLISH'
        elif call_pct <= 35:
            bias = 'BEARISH'
        else:
            bias = 'MIXED'
        symbol_bias[s] = {'bias': bias, 'callPct': call_pct, 'callPremium': cp, 'putPremium': pp}

    # Stamp bias onto every flow row
    for f in all_flow:
        sb = symbol_bias.get(f['symbol'], {})
        f['symbolBias']    = sb.get('bias', 'MIXED')
        f['callPct']       = sb.get('callPct', 50)
        f['callPremSym']   = sb.get('callPremium', 0)
        f['putPremSym']    = sb.get('putPremium', 0)

    return {
        'flow':        all_flow[:limit],
        'symbolBias':  symbol_bias,
        'scannedAt':   datetime.utcnow().isoformat(),
        'total':       len(all_flow),
        'totalSymbols': len(symbol_bias),
    }
