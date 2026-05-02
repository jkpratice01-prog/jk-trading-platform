"""
Earnings history: last 8 quarters of EPS beat/miss with stock move.
"""
import pandas as pd
from datetime import datetime, timedelta
from server.services.yf_session import ticker as yf_ticker


def _stock_move(hist: pd.DataFrame, earnings_ts) -> float | None:
    """Return % price change on the trading day of/after the earnings announcement."""
    try:
        target_date = earnings_ts.date()
        dates_index = {d.date(): i for i, d in enumerate(hist.index)}
        # Earnings often AMC → move shows next trading day; check +0, +1, +2
        for delta in range(3):
            d = target_date + timedelta(days=delta)
            idx = dates_index.get(d)
            if idx is not None and idx > 0:
                curr = float(hist['Close'].iloc[idx])
                prev = float(hist['Close'].iloc[idx - 1])
                return round((curr - prev) / prev * 100, 2)
        return None
    except Exception:
        return None


def _quarter_label(ts) -> str:
    """Turn an announcement timestamp into an approximate fiscal quarter label."""
    m = ts.month
    y = ts.year
    if m <= 3:
        return f"Q4 {y - 1}"
    elif m <= 6:
        return f"Q1 {y}"
    elif m <= 9:
        return f"Q2 {y}"
    else:
        return f"Q3 {y}"


def get_earnings_history(symbol: str, quarters: int = 8) -> dict:
    try:
        t = yf_ticker(symbol.upper())

        ed = t.earnings_dates
        if ed is None or ed.empty:
            return {'symbol': symbol.upper(), 'history': [], 'message': 'No earnings history available'}

        now  = pd.Timestamp.now(tz='UTC')
        past = ed[ed.index <= now].head(quarters)

        # 2-year daily history for move calculation
        hist = t.history(period='2y', interval='1d')

        records = []
        for ts, row in past.iterrows():
            eps_est = row.get('EPS Estimate')
            eps_act = row.get('Reported EPS')
            surprise = row.get('Surprise(%)')

            def safe_float(v):
                try:
                    f = float(v)
                    return None if pd.isna(f) else f
                except Exception:
                    return None

            est = safe_float(eps_est)
            act = safe_float(eps_act)
            sur = safe_float(surprise)
            beat = (act > est) if (act is not None and est is not None) else None
            move = _stock_move(hist, ts) if not hist.empty else None

            records.append({
                'date':        ts.strftime('%Y-%m-%d'),
                'quarter':     _quarter_label(ts),
                'epsEstimate': round(est, 2) if est is not None else None,
                'epsActual':   round(act, 2) if act is not None else None,
                'surprise':    round(sur, 1) if sur is not None else None,
                'beat':        beat,
                'stockMove':   move,
            })

        # Summary stats
        beaten     = [r for r in records if r['beat'] is True]
        missed     = [r for r in records if r['beat'] is False]
        moves_up   = [r['stockMove'] for r in records if r['stockMove'] and r['stockMove'] > 0]
        moves_down = [r['stockMove'] for r in records if r['stockMove'] and r['stockMove'] < 0]
        avg_move   = round(sum(abs(r['stockMove']) for r in records if r['stockMove']) / max(len([r for r in records if r['stockMove']]), 1), 2)

        return {
            'symbol':    symbol.upper(),
            'history':   records,
            'summary': {
                'totalQuarters': len(records),
                'beats':         len(beaten),
                'misses':        len(missed),
                'beatRate':      round(len(beaten) / max(len(records), 1) * 100, 0),
                'avgMove':       avg_move,
                'avgUpMove':     round(sum(moves_up) / max(len(moves_up), 1), 2),
                'avgDownMove':   round(sum(moves_down) / max(len(moves_down), 1), 2),
            },
            'fetchedAt': datetime.utcnow().isoformat(),
        }
    except Exception as e:
        return {'symbol': symbol.upper(), 'history': [], 'error': str(e)}
