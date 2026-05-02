"""Holdings Tracker service — manages portfolio positions with price tracking."""
import threading
import time
from datetime import datetime, timezone

from server.db import get_db
from server.services.yf_session import ticker as yf_ticker, resolve as resolve_sym

_refresh_thread: threading.Thread | None = None
_thread_lock = threading.Lock()


# ── Schema init (called at startup) ──────────────────────────────────────────

def init_tables():
    """Ensure holdings tables exist (belt-and-suspenders after init_db)."""
    conn = get_db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS holdings (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol          TEXT    NOT NULL,
        name            TEXT,
        asset_type      TEXT    DEFAULT 'stock',
        provider        TEXT    DEFAULT 'Manual',
        purchased_price REAL    NOT NULL,
        qty             REAL    NOT NULL DEFAULT 1,
        purchased_date  TEXT,
        notes           TEXT,
        current_price   REAL,
        price_updated_at TEXT,
        created_at      TEXT    DEFAULT (datetime('now')),
        updated_at      TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_holdings ON holdings(symbol);

    CREATE TABLE IF NOT EXISTS holdings_price_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol      TEXT    NOT NULL,
        price       REAL,
        day_high    REAL,
        day_low     REAL,
        volume      INTEGER,
        change_pct  REAL,
        recorded_at TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_hph ON holdings_price_history(symbol, recorded_at DESC);
    """)
    conn.commit()
    conn.close()


# ── Helper ────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_float(info: dict, *keys, default=None):
    """Try multiple dict keys and return the first non-None numeric value."""
    for k in keys:
        v = info.get(k)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
    return default


# ── Public functions ──────────────────────────────────────────────────────────

def get_holdings() -> list:
    """
    Fast DB read — does NOT call yfinance.
    Joins holdings with latest price_history row per symbol.
    Returns computed P&L fields.
    """
    conn = get_db()
    rows = conn.execute("""
        SELECT
            h.id, h.symbol, h.name, h.asset_type, h.provider,
            h.purchased_price, h.qty, h.purchased_date, h.notes,
            h.current_price, h.price_updated_at, h.created_at, h.updated_at,
            ph.day_high, ph.day_low, ph.volume, ph.change_pct
        FROM holdings h
        LEFT JOIN (
            SELECT symbol, day_high, day_low, volume, change_pct
            FROM holdings_price_history
            WHERE (symbol, recorded_at) IN (
                SELECT symbol, MAX(recorded_at)
                FROM holdings_price_history
                GROUP BY symbol
            )
        ) ph ON ph.symbol = h.symbol
        ORDER BY h.created_at DESC
    """).fetchall()
    conn.close()

    result = []
    for r in rows:
        row = dict(r)
        cp  = row.get('current_price')
        pp  = row.get('purchased_price')
        qty = row.get('qty') or 0

        if cp is not None and pp is not None and pp != 0:
            row['plAbs']       = round((cp - pp) * qty, 4)
            row['plPct']       = round((cp - pp) / pp * 100, 4)
            row['marketValue'] = round(cp * qty, 4)
        else:
            row['plAbs']       = None
            row['plPct']       = None
            row['marketValue'] = None

        row['costBasis'] = round(pp * qty, 4) if pp is not None else None
        result.append(row)

    return result


def get_holding_detail(symbol: str) -> dict:
    """
    On-demand: fetch extended fundamental info from yfinance.
    Called only when a table row is expanded.
    """
    sym = resolve_sym(symbol.upper())
    try:
        t    = yf_ticker(sym)
        info = t.info or {}
    except Exception as e:
        return {'symbol': symbol.upper(), 'error': str(e)}

    # Earnings date from unix timestamp
    earnings_date = None
    ts = info.get('earningsTimestamp')
    if ts:
        try:
            earnings_date = datetime.fromtimestamp(int(ts), tz=timezone.utc).date().isoformat()
        except Exception:
            pass

    desc = info.get('longBusinessSummary', '')
    if desc and len(desc) > 300:
        desc = desc[:300] + '…'

    return {
        'symbol':      symbol.upper(),
        'week52High':  info.get('fiftyTwoWeekHigh'),
        'week52Low':   info.get('fiftyTwoWeekLow'),
        'earningsDate': earnings_date,
        'marketCap':   info.get('marketCap'),
        'beta':        info.get('beta'),
        'sector':      info.get('sector'),
        'industry':    info.get('industry'),
        'description': desc,
    }


def add_holding(
    symbol: str,
    purchased_price: float,
    qty: float = 1.0,
    provider: str = 'Manual',
    asset_type: str = 'stock',
    purchased_date: str | None = None,
    notes: str | None = None,
) -> dict:
    """Add a new holding, auto-fetch name and current price from yfinance."""
    sym = resolve_sym(symbol.upper())

    # Fetch name from yfinance
    name = sym
    try:
        t    = yf_ticker(sym)
        info = t.info or {}
        name = info.get('shortName') or info.get('longName') or sym
    except Exception:
        pass

    conn = get_db()
    now  = _now_iso()
    cur  = conn.execute(
        """INSERT INTO holdings
           (symbol, name, asset_type, provider, purchased_price, qty,
            purchased_date, notes, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (sym, name, asset_type, provider, purchased_price, qty,
         purchased_date, notes, now, now)
    )
    conn.commit()
    holding_id = cur.lastrowid
    conn.close()

    # Immediately fetch and store current price
    try:
        _fetch_and_save_price(sym)
    except Exception:
        pass

    return {'id': holding_id, 'symbol': sym, 'ok': True}


def update_holding(holding_id: int, **kwargs) -> dict:
    """Update allowed fields on a holding."""
    allowed = {'symbol', 'name', 'asset_type', 'provider', 'purchased_price',
               'qty', 'purchased_date', 'notes'}
    updates = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not updates:
        return {'ok': True}

    updates['updated_at'] = _now_iso()
    set_clause = ', '.join(f'{k}=?' for k in updates)
    values     = list(updates.values()) + [holding_id]

    conn = get_db()
    conn.execute(f"UPDATE holdings SET {set_clause} WHERE id=?", values)
    conn.commit()
    conn.close()
    return {'ok': True}


def delete_holding(holding_id: int) -> dict:
    """Delete a holding; keep price history for audit."""
    conn = get_db()
    conn.execute("DELETE FROM holdings WHERE id=?", (holding_id,))
    conn.commit()
    conn.close()
    return {'ok': True}


def get_price_history(symbol: str, days: int = 30) -> list:
    """Return price history for sparkline — ordered ASC."""
    sym  = resolve_sym(symbol.upper())
    conn = get_db()
    rows = conn.execute(
        """SELECT price, day_high, day_low, change_pct, recorded_at
           FROM holdings_price_history
           WHERE symbol=?
             AND recorded_at >= datetime('now', ?)
           ORDER BY recorded_at ASC""",
        (sym, f'-{days} days')
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def refresh_all_prices() -> dict:
    """
    Fetch current prices for all distinct symbols in holdings.
    Updates holdings.current_price and inserts into price history.
    One failure does not stop the rest.
    """
    conn = get_db()
    syms = [r[0] for r in conn.execute(
        "SELECT DISTINCT symbol FROM holdings"
    ).fetchall()]
    conn.close()

    updated = 0
    now     = _now_iso()

    for sym in syms:
        try:
            price_row = _fetch_and_save_price(sym)
            if price_row:
                updated += 1
        except Exception as e:
            print(f"[holdings] price refresh failed for {sym}: {e}")

    return {'updated': updated, 'at': now}


# ── Background job ────────────────────────────────────────────────────────────

def start_price_refresh_job(interval_seconds: int = 3600):
    """Start a daemon thread that refreshes prices every interval_seconds."""
    global _refresh_thread

    with _thread_lock:
        if _refresh_thread is not None and _refresh_thread.is_alive():
            print("[holdings] price refresh thread already running — skipping")
            return

        def _run():
            while True:
                try:
                    result = refresh_all_prices()
                    print(f"[holdings] price refresh complete — {result['updated']} symbols at {result['at']}")
                except Exception as e:
                    print(f"[holdings] price refresh loop error: {e}")
                time.sleep(interval_seconds)

        _refresh_thread = threading.Thread(target=_run, daemon=True, name='holdings-price-refresh')
        _refresh_thread.start()
        print(f"[holdings] price refresh job started (interval={interval_seconds}s)")


# ── Internal helper ───────────────────────────────────────────────────────────

def _fetch_and_save_price(sym: str) -> dict | None:
    """
    Fetch current price for a symbol from yfinance and persist it.
    Updates holdings.current_price + inserts holdings_price_history row.
    Returns a dict with price data, or None if fetch failed.
    """
    t = yf_ticker(sym)
    try:
        info = t.info or {}
    except Exception:
        info = {}

    price = _safe_float(info, 'regularMarketPrice', 'currentPrice')
    if price is None:
        return None

    day_high   = _safe_float(info, 'regularMarketDayHigh', 'dayHigh')
    day_low    = _safe_float(info, 'regularMarketDayLow',  'dayLow')
    change_pct = _safe_float(info, 'regularMarketChangePercent')
    volume     = info.get('regularMarketVolume')
    now        = _now_iso()

    conn = get_db()
    # Update all holdings rows that have this symbol
    conn.execute(
        "UPDATE holdings SET current_price=?, price_updated_at=?, updated_at=? WHERE symbol=?",
        (price, now, now, sym)
    )
    # Insert price history row
    conn.execute(
        """INSERT INTO holdings_price_history
           (symbol, price, day_high, day_low, volume, change_pct, recorded_at)
           VALUES (?,?,?,?,?,?,?)""",
        (sym, price, day_high, day_low, volume, change_pct, now)
    )
    conn.commit()
    conn.close()

    return {
        'symbol':     sym,
        'price':      price,
        'day_high':   day_high,
        'day_low':    day_low,
        'change_pct': change_pct,
        'volume':     volume,
    }