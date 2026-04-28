"""Chart data — OHLCV bars via yfinance, respecting the requested time range."""
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from server.db import get_db

# yfinance maximum lookback per interval
_MAX_DAYS = {
    '1m': 7, '2m': 60, '5m': 60, '15m': 60, '30m': 60,
    '60m': 730, '1h': 730, '4h': 730,
    '1d': 3650, '5d': 3650, '1wk': 3650, '1mo': 3650,
}

# How long cached data stays valid (seconds)
_TTL = {
    '1m': 30, '5m': 60, '15m': 60, '30m': 120,
    '1h': 300, '4h': 600, '1d': 3600,
}


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
        freshness = (datetime.utcnow() - datetime.fromisoformat(rows[-1]['bar_time'])).total_seconds()
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


def _to_response(sym: str, bars: list, source: str) -> dict:
    return {
        'symbol':     sym,
        'timestamps': [int(datetime.fromisoformat(b['t']).timestamp()) for b in bars],
        'open':       [b['o'] for b in bars],
        'high':       [b['h'] for b in bars],
        'low':        [b['l'] for b in bars],
        'close':      [b['c'] for b in bars],
        'volume':     [b['v'] for b in bars],
        'source':     source,
    }


def get_chart(symbol: str, days: int = 60, interval: str = '1d',
              alpaca_key: str = '', alpaca_secret: str = '') -> dict:
    sym = symbol.upper()

    # 4h is not a native yfinance interval — fetch 1h and resample
    is_4h      = interval == '4h'
    yf_interval = '1h' if is_4h else interval

    # Cap `days` to what yfinance actually supports for this interval
    max_days   = _MAX_DAYS.get(yf_interval, 3650)
    fetch_days = min(max(days, 1), max_days)

    # Cache lookup (use the user-requested interval as cache key)
    cached = _read_cache(sym, interval, fetch_days)
    if cached:
        return _to_response(sym, [dict(r) for r in cached], 'cache')

    try:
        hist = yf.Ticker(sym).history(period=f'{fetch_days}d', interval=yf_interval)
        if hist.empty:
            return {'symbol': sym, 'close': [], 'timestamps': [], 'error': 'No data'}

        # Strip timezone
        hist.index = hist.index.tz_localize(None) if hist.index.tzinfo else hist.index

        # Resample to 4h if requested
        if is_4h:
            hist = (hist
                    .resample('4h')
                    .agg({'Open': 'first', 'High': 'max', 'Low': 'min',
                          'Close': 'last', 'Volume': 'sum'})
                    .dropna(subset=['Open', 'Close']))

        bars = [
            {
                't': ts.isoformat(),
                'o': round(float(row['Open']),   4),
                'h': round(float(row['High']),   4),
                'l': round(float(row['Low']),    4),
                'c': round(float(row['Close']),  4),
                'v': int(row['Volume']),
            }
            for ts, row in hist.iterrows()
            if pd.notna(row['Close'])
        ]

        _save_cache(sym, interval, bars)
        return _to_response(sym, bars, 'yfinance')

    except Exception as e:
        return {'symbol': sym, 'close': [], 'timestamps': [], 'error': str(e)}
