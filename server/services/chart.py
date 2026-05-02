"""Chart data — OHLCV bars via yfinance, respecting the requested time range."""
import pandas as pd
from datetime import datetime, timedelta, timezone
from server.db import get_db
from server.services.yf_session import ticker as yf_ticker, resolve as resolve_sym

# yfinance maximum lookback per interval
_MAX_DAYS = {
    '1m': 7, '2m': 60, '5m': 60, '15m': 60, '30m': 60,
    '60m': 730, '1h': 730, '4h': 730,
    '1d': 3650, '5d': 3650, '1wk': 3650, '1mo': 3650,
}

# Cache TTL in seconds per interval
_TTL = {
    '1m': 30, '5m': 60, '15m': 120, '30m': 180,
    '1h': 300, '4h': 600, '1d': 3600,
}

_DAILY_INTERVALS = {'1d', '1wk', '1mo', '5d'}


def _read_cache(symbol: str, interval: str, days: int):
    try:
        conn   = get_db()
        cutoff = (datetime.utcnow() - timedelta(days=days + 1)).isoformat()
        rows   = conn.execute(
            "SELECT bar_time,open,high,low,close,volume FROM chart_data "
            "WHERE symbol=? AND interval=? AND bar_time>=? ORDER BY bar_time ASC",
            (symbol, interval, cutoff)
        ).fetchall()
        conn.close()
        if not rows:
            return None
        ttl       = _TTL.get(interval, 300)
        last_bar  = rows[-1]['bar_time']
        try:
            last_dt = datetime.fromisoformat(last_bar).replace(tzinfo=timezone.utc)
        except Exception:
            return None
        freshness = (datetime.now(timezone.utc) - last_dt).total_seconds()
        return rows if freshness <= ttl else None
    except Exception:
        return None


def _save_cache(symbol: str, interval: str, bars: list):
    try:
        conn = get_db()
        now  = datetime.utcnow().isoformat()
        conn.executemany(
            "INSERT OR REPLACE INTO chart_data "
            "(symbol,interval,bar_time,open,high,low,close,volume,fetched_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            [(symbol, interval, b['t'], b['o'], b['h'], b['l'], b['c'], b['v'], now)
             for b in bars]
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def _bar_time(t_str: str, interval: str):
    """
    Convert a stored UTC-ISO bar_time string to the format lightweight-charts expects.
    - Daily/weekly/monthly → 'YYYY-MM-DD' date string (no timezone ambiguity)
    - Intraday             → integer Unix UTC timestamp
    """
    if interval in _DAILY_INTERVALS:
        return t_str[:10]          # 'YYYY-MM-DD'
    # Treat stored string as UTC
    dt = datetime.fromisoformat(t_str).replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _to_response(sym: str, bars: list, source: str, interval: str) -> dict:
    return {
        'symbol':     sym,
        'timestamps': [_bar_time(b['t'], interval) for b in bars],
        'open':       [b['o'] for b in bars],
        'high':       [b['h'] for b in bars],
        'low':        [b['l'] for b in bars],
        'close':      [b['c'] for b in bars],
        'volume':     [b['v'] for b in bars],
        'source':     source,
    }


def get_chart(symbol: str, days: int = 60, interval: str = '1d',
              alpaca_key: str = '', alpaca_secret: str = '') -> dict:
    sym = resolve_sym(symbol.upper())

    # 4h is not a native yfinance interval — fetch 1h and resample
    is_4h       = interval == '4h'
    yf_interval = '1h' if is_4h else interval

    max_days    = _MAX_DAYS.get(yf_interval, 3650)
    fetch_days  = min(max(days, 1), max_days)

    # Cache lookup
    cached = _read_cache(sym, interval, fetch_days)
    if cached:
        return _to_response(sym, [dict(r) for r in cached], 'cache', interval)

    try:
        t    = yf_ticker(sym)
        hist = t.history(period=f'{fetch_days}d', interval=yf_interval)
        if hist.empty:
            return {'symbol': sym, 'close': [], 'timestamps': [], 'error': 'No data'}

        # ── Timezone: always convert to UTC before stripping ─────────────────
        # yfinance returns Eastern-timezone-aware timestamps. tz_localize(None)
        # alone keeps Eastern values but removes the label, causing timestamp
        # errors on machines not in ET. Convert to UTC first.
        if hist.index.tzinfo is not None:
            hist.index = hist.index.tz_convert('UTC').tz_localize(None)

        # Resample to 4h
        if is_4h:
            hist = (hist
                    .resample('4h')
                    .agg({'Open': 'first', 'High': 'max', 'Low': 'min',
                          'Close': 'last', 'Volume': 'sum'})
                    .dropna(subset=['Open', 'Close']))

        bars = [
            {
                't': ts.isoformat(),            # UTC naive ISO string
                'o': round(float(row['Open']),  4),
                'h': round(float(row['High']),  4),
                'l': round(float(row['Low']),   4),
                'c': round(float(row['Close']), 4),
                'v': int(row['Volume']),
            }
            for ts, row in hist.iterrows()
            if pd.notna(row['Close'])
        ]

        _save_cache(sym, interval, bars)
        return _to_response(sym, bars, 'yfinance', interval)

    except Exception as e:
        return {'symbol': sym, 'close': [], 'timestamps': [], 'error': str(e)}
