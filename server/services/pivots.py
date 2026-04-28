"""Pivot point levels — daily, weekly, monthly from prior session OHLC."""
import yfinance as yf
from datetime import datetime


def _levels(h: float, l: float, c: float) -> dict:
    pp = (h + l + c) / 3
    return {
        'pp': round(pp, 2),
        'r1': round(2*pp - l, 2),
        'r2': round(pp + (h - l), 2),
        'r3': round(h + 2*(pp - l), 2),
        's1': round(2*pp - h, 2),
        's2': round(pp - (h - l), 2),
        's3': round(l - 2*(h - pp), 2),
    }


def get_pivots(symbol: str) -> dict:
    sym = symbol.upper()
    t   = yf.Ticker(sym)
    result = {'symbol': sym, 'computedAt': datetime.utcnow().isoformat()}

    # Daily — prior completed session (index -2)
    try:
        daily = t.history(period='5d', interval='1d')
        if len(daily) >= 2:
            r = daily.iloc[-2]
            result['daily'] = {
                **_levels(float(r['High']), float(r['Low']), float(r['Close'])),
                'date': str(daily.index[-2])[:10],
            }
    except Exception:
        pass

    # Weekly — prior completed week
    try:
        weekly = t.history(period='3mo', interval='1wk')
        idx = -2 if len(weekly) >= 2 else -1
        if len(weekly) >= 1:
            r = weekly.iloc[idx]
            result['weekly'] = {
                **_levels(float(r['High']), float(r['Low']), float(r['Close'])),
                'date': str(weekly.index[idx])[:10],
            }
    except Exception:
        pass

    # Monthly — prior completed month
    try:
        monthly = t.history(period='1y', interval='1mo')
        idx = -2 if len(monthly) >= 2 else -1
        if len(monthly) >= 1:
            r = monthly.iloc[idx]
            result['monthly'] = {
                **_levels(float(r['High']), float(r['Low']), float(r['Close'])),
                'date': str(monthly.index[idx])[:10],
            }
    except Exception:
        pass

    return result
