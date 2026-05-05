"""
Pre-earnings institutional flow scanner.

Detects when institutions are quietly positioning (buying calls/stock)
ahead of earnings by combining: options C/P ratio, call Vol/OI,
stock volume surge, and hot-strike detection.
"""
import time
import pandas as pd
from server.services.yf_session import ticker as yf_ticker
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

SCAN_SYMBOLS = [
    # Mega-cap tech (high earnings impact)
    'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'INTC', 'QCOM',
    'AVGO', 'ORCL', 'CRM', 'ADBE', 'NOW', 'SNOW', 'PLTR', 'COIN', 'RBLX', 'UBER',
    # Finance
    'JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'AXP', 'C', 'SCHW', 'BLK',
    # Energy
    'XOM', 'CVX', 'COP', 'OXY', 'SLB',
    # Healthcare / Biotech
    'UNH', 'LLY', 'PFE', 'JNJ', 'ABBV', 'MRNA', 'AMGN', 'GILD', 'ISRG', 'REGN',
    # Consumer
    'WMT', 'COST', 'TGT', 'HD', 'LOW', 'NKE', 'SBUX', 'MCD',
    # Media / Streaming
    'NFLX', 'DIS', 'SPOT', 'ROKU',
    # Semis
    'MU', 'AMAT', 'LRCX', 'KLAC', 'TXN',
    # EV / Growth
    'RIVN', 'LCID', 'SOFI', 'HOOD',
]
# Deduplicate preserving order
_seen: set = set()
SCAN_SYMBOLS = [s for s in SCAN_SYMBOLS if not (_seen.add(s) or s in _seen - {s})]  # type: ignore
SCAN_SYMBOLS = list(dict.fromkeys(SCAN_SYMBOLS))


def _nearest_earnings(ticker) -> tuple | None:
    """Return (earnings_timestamp, days_away) for the nearest upcoming earnings or None."""
    try:
        ed = ticker.earnings_dates
        if ed is None or ed.empty:
            return None
        now = pd.Timestamp.now(tz='UTC')
        cutoff = now + pd.Timedelta(days=30)
        future = ed[(ed.index.normalize() >= now.normalize()) & (ed.index <= cutoff)]
        if future.empty:
            return None
        dt = future.index[-1]
        days_away = max(1, (dt.date() - now.date()).days)
        return dt, days_away
    except Exception:
        return None


def _analyze(symbol: str, days_ahead: int, attempt: int = 0) -> dict | None:
    try:
        ticker = yf_ticker(symbol)

        # ── Earnings date ────────────────────────────────────────────────────
        res = _nearest_earnings(ticker)
        if res is None:
            return None
        earnings_dt, days_away = res
        if days_away > days_ahead:
            return None

        # ── Stock volume vs 10-day average ───────────────────────────────────
        hist = ticker.history(period='10d', interval='1d')
        if hist.empty or len(hist) < 3:
            return None
        today_vol = int(hist['Volume'].iloc[-1])
        avg_vol = float(hist['Volume'].iloc[:-1].mean())
        stock_vol_ratio = today_vol / avg_vol if avg_vol > 100_000 else 1.0
        current_price = float(hist['Close'].iloc[-1])

        # ── Options chain for nearest expiry AT or after earnings ────────────
        exps = ticker.options
        if not exps:
            return None
        earnings_date = earnings_dt.date()
        post = [e for e in exps if pd.Timestamp(e).date() >= earnings_date]
        target_expiry = post[0] if post else exps[0]

        chain = ticker.option_chain(target_expiry)
        calls = chain.calls.copy()
        puts  = chain.puts.copy()
        if calls.empty or puts.empty:
            return None

        # ── Flow metrics ─────────────────────────────────────────────────────
        call_vol = int(calls['volume'].fillna(0).sum())
        put_vol  = int(puts['volume'].fillna(0).sum())
        call_oi  = int(calls['openInterest'].fillna(0).sum())
        put_oi   = int(puts['openInterest'].fillna(0).sum())

        if call_vol + put_vol < 100:
            return None  # Too illiquid

        cp_ratio     = round(call_vol / put_vol, 2) if put_vol > 0 else float(call_vol)
        call_vol_oi  = round(call_vol / call_oi,  2) if call_oi  > 0 else 0.0
        put_vol_oi   = round(put_vol  / put_oi,   2) if put_oi   > 0 else 0.0

        # Hot strike: single strike where vol/OI > 1.5 (targeted institutional bet)
        calls['_voi'] = calls['volume'].fillna(0) / calls['openInterest'].replace(0, 1)
        hot = calls[calls['_voi'] > 1.5].sort_values('volume', ascending=False)
        hot_strike      = float(hot.iloc[0]['strike'])     if not hot.empty else None
        hot_strike_vol  = int(hot.iloc[0]['volume'])       if not hot.empty else None

        avg_call_iv = float(calls['impliedVolatility'].mean()) if 'impliedVolatility' in calls.columns else None

        # ── Scoring ──────────────────────────────────────────────────────────
        score = 0
        signals: list[str] = []

        if cp_ratio >= 3:
            score += 35; signals.append(f'Strong call bias — C/P ratio {cp_ratio:.1f}×')
        elif cp_ratio >= 2:
            score += 22; signals.append(f'Call bias — C/P ratio {cp_ratio:.1f}×')
        elif cp_ratio >= 1.4:
            score += 10; signals.append(f'Mild call bias ({cp_ratio:.1f}×)')
        elif cp_ratio <= 0.4:
            score += 30; signals.append(f'Heavy put buying — C/P ratio {cp_ratio:.1f}×')
        elif cp_ratio <= 0.7:
            score += 18; signals.append(f'Put bias — C/P ratio {cp_ratio:.1f}×')

        if call_vol_oi >= 1.5:
            score += 28; signals.append(f'New call positions opening (Vol/OI {call_vol_oi:.1f}×)')
        elif call_vol_oi >= 0.8:
            score += 14; signals.append(f'Call Vol/OI elevated ({call_vol_oi:.1f}×)')

        if put_vol_oi >= 1.5 and cp_ratio < 1:
            score += 20; signals.append(f'New put positions opening (Vol/OI {put_vol_oi:.1f}×)')

        if stock_vol_ratio >= 2.5:
            score += 25; signals.append(f'Stock volume {stock_vol_ratio:.1f}× average — big money moving in')
        elif stock_vol_ratio >= 1.7:
            score += 14; signals.append(f'Elevated stock volume ({stock_vol_ratio:.1f}×)')

        if hot_strike:
            score += 18
            signals.append(f'Targeted bet: ${hot_strike:.0f} strike ({hot_strike_vol:,} contracts)')

        if days_away <= 2:
            score += 12; signals.append('Earnings imminent (≤2 days)')
        elif days_away <= 5:
            score += 6

        score = min(score, 100)
        if score < 25:
            return None

        # ── Direction ────────────────────────────────────────────────────────
        if cp_ratio >= 1.4 or (call_vol_oi > put_vol_oi * 1.3 and cp_ratio >= 1.0):
            direction = 'BULLISH'
        elif cp_ratio <= 0.6 or (put_vol_oi > call_vol_oi * 1.3 and cp_ratio < 1.0):
            direction = 'BEARISH'
        else:
            direction = 'NEUTRAL'

        return {
            'symbol':        symbol,
            'earningsDate':  earnings_dt.strftime('%Y-%m-%d'),
            'daysToEarnings': days_away,
            'direction':     direction,
            'score':         score,
            'signals':       signals,
            'callVolume':    call_vol,
            'putVolume':     put_vol,
            'cpRatio':       cp_ratio,
            'callVolOI':     call_vol_oi,
            'putVolOI':      put_vol_oi,
            'stockVolRatio': round(stock_vol_ratio, 2),
            'hotStrike':     hot_strike,
            'hotStrikeVol':  hot_strike_vol,
            'avgCallIV':     round(avg_call_iv * 100, 1) if avg_call_iv else None,
            'price':         round(current_price, 2),
            'expiry':        target_expiry,
            'scannedAt':     datetime.utcnow().isoformat(),
        }
    except Exception as e:
        # Retry once on rate limit with back-off
        if attempt == 0 and ('rate' in str(e).lower() or 'too many' in str(e).lower()):
            time.sleep(4)
            return _analyze(symbol, days_ahead, attempt=1)
        return None


def scan_earnings_flow(days_ahead: int = 21, limit: int = 60) -> dict:
    symbols = SCAN_SYMBOLS[:limit]
    results = []
    # 4 workers to stay within Yahoo Finance rate limits
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(_analyze, s, days_ahead): s for s in symbols}
        for fut in as_completed(futures, timeout=120):
            r = fut.result()
            if r:
                results.append(r)

    # Sort: highest score first, then nearest earnings
    results.sort(key=lambda x: (-x['score'], x['daysToEarnings']))

    return {
        'results':   results,
        'count':     len(results),
        'daysAhead': days_ahead,
        'scannedAt': datetime.utcnow().isoformat(),
    }
