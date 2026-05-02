"""
Pivot point levels — standard, Fibonacci, previous-day levels,
and swing high/low detection from recent price action.
"""
from datetime import datetime, date as _date
from zoneinfo import ZoneInfo
from server.services.yf_session import ticker as yf_ticker, resolve as resolve_sym

_ET = ZoneInfo('America/New_York')


def _std_pivots(h: float, l: float, c: float) -> dict:
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


def _fib_pivots(h: float, l: float, c: float) -> dict:
    pp    = (h + l + c) / 3
    rng   = h - l
    return {
        'pp': round(pp, 2),
        'r1': round(pp + 0.382 * rng, 2),
        'r2': round(pp + 0.618 * rng, 2),
        'r3': round(pp + 1.000 * rng, 2),
        's1': round(pp - 0.382 * rng, 2),
        's2': round(pp - 0.618 * rng, 2),
        's3': round(pp - 1.000 * rng, 2),
    }


def _last_completed_bar(history):
    """
    Return (row, date_str) for the most recent *completed* daily bar.

    During market hours today's bar is still in-progress → return yesterday's.
    After 4:15 PM ET (market settled) today's bar is complete → return today's.
    This ensures PDH/PDL/PDC and pivot levels always reflect the last closed session.
    """
    if history is None or len(history) < 1:
        return None, None

    now_et   = datetime.now(_ET)
    today_et = now_et.date()

    # Resolve the date of the last bar (handles both date and datetime index)
    last_idx = history.index[-1]
    try:
        if hasattr(last_idx, 'to_pydatetime'):
            dt = last_idx.to_pydatetime()
            last_date = (dt.astimezone(_ET) if dt.tzinfo else dt).date()
        else:
            last_date = _date.fromisoformat(str(last_idx)[:10])
    except Exception:
        last_date = None

    # Market settles by 4:15 PM ET; before that, today's bar is in-progress
    market_closed = (now_et.hour > 16) or (now_et.hour == 16 and now_et.minute >= 15)

    if last_date == today_et and not market_closed and len(history) >= 2:
        # Today's bar is live — use yesterday's completed bar
        idx = -2
    else:
        # Today's bar is complete (or last bar is from a prior day)
        idx = -1

    row      = history.iloc[idx]
    date_str = str(history.index[idx])[:10]
    return row, date_str


def _detect_swings(hist, lookback: int = 60, n: int = 3, max_levels: int = 6):
    """Return recent swing highs and lows from price history."""
    if hist is None or len(hist) < lookback:
        return [], []

    recent = hist.tail(lookback)
    highs  = recent['High'].values.tolist()
    lows   = recent['Low'].values.tolist()
    dates  = [str(d)[:10] for d in recent.index]

    raw_highs, raw_lows = [], []
    for i in range(n, len(highs) - n):
        if all(highs[i] >= highs[j] for j in range(i - n, i + n + 1) if j != i):
            raw_highs.append({'price': round(float(highs[i]), 2), 'date': dates[i]})
        if all(lows[i]  <= lows[j]  for j in range(i - n, i + n + 1) if j != i):
            raw_lows.append({'price': round(float(lows[i]),  2), 'date': dates[i]})

    def dedupe(levels, min_pct=0.005):
        result = []
        for lvl in reversed(levels):
            if not any(abs(lvl['price'] - r['price']) / max(r['price'], 1) < min_pct for r in result):
                result.append(lvl)
            if len(result) >= max_levels:
                break
        return list(reversed(result))

    return dedupe(raw_highs), dedupe(raw_lows)


def get_pivots(symbol: str) -> dict:
    sym    = resolve_sym(symbol.upper())
    t      = yf_ticker(sym)
    result = {'symbol': sym, 'computedAt': datetime.utcnow().isoformat()}

    # ── Daily history (needed for pivots + swing detection) ───────────────────
    try:
        daily = t.history(period='90d', interval='1d')
    except Exception:
        daily = None

    # ── Previous day / pivot reference: last *completed* session ──────────────
    ref_row, ref_date = _last_completed_bar(daily)

    if ref_row is not None:
        result['prevDay'] = {
            'high':  round(float(ref_row['High']),  2),
            'low':   round(float(ref_row['Low']),   2),
            'close': round(float(ref_row['Close']), 2),
            'date':  ref_date,
        }
        result['daily'] = {
            **_std_pivots(float(ref_row['High']), float(ref_row['Low']), float(ref_row['Close'])),
            'fib': _fib_pivots(float(ref_row['High']), float(ref_row['Low']), float(ref_row['Close'])),
            'date': ref_date,
        }

    # ── Weekly pivots (last completed week) ───────────────────────────────────
    try:
        weekly = t.history(period='3mo', interval='1wk')
        if len(weekly) >= 2:
            r = weekly.iloc[-2]
            result['weekly'] = {
                **_std_pivots(float(r['High']), float(r['Low']), float(r['Close'])),
                'fib': _fib_pivots(float(r['High']), float(r['Low']), float(r['Close'])),
                'date': str(weekly.index[-2])[:10],
            }
    except Exception:
        pass

    # ── Monthly pivots (last completed month) ─────────────────────────────────
    try:
        monthly = t.history(period='1y', interval='1mo')
        if len(monthly) >= 2:
            r = monthly.iloc[-2]
            result['monthly'] = {
                **_std_pivots(float(r['High']), float(r['Low']), float(r['Close'])),
                'fib': _fib_pivots(float(r['High']), float(r['Low']), float(r['Close'])),
                'date': str(monthly.index[-2])[:10],
            }
    except Exception:
        pass

    # ── Swing highs / lows from recent price action ───────────────────────────
    if daily is not None:
        swing_highs, swing_lows = _detect_swings(daily)
        result['swingHighs'] = swing_highs
        result['swingLows']  = swing_lows

    return result