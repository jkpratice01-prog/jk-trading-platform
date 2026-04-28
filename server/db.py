import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "trading.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS quotes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT NOT NULL,
    short_name      TEXT,
    price           REAL,
    change_amt      REAL,
    change_pct      REAL,
    volume          INTEGER,
    day_high        REAL,
    day_low         REAL,
    prev_close      REAL,
    market_cap      REAL,
    pe_ratio        REAL,
    bid             REAL,
    ask             REAL,
    avg_volume      INTEGER,
    data_source     TEXT,
    fetched_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quotes ON quotes(symbol, fetched_at DESC);

CREATE TABLE IF NOT EXISTS chart_data (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT NOT NULL,
    interval    TEXT NOT NULL,
    bar_time    TEXT NOT NULL,
    open        REAL, high REAL, low REAL, close REAL, volume INTEGER,
    fetched_at  TEXT NOT NULL,
    UNIQUE(symbol, interval, bar_time)
);
CREATE INDEX IF NOT EXISTS idx_chart ON chart_data(symbol, interval, bar_time DESC);

CREATE TABLE IF NOT EXISTS options (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol              TEXT NOT NULL,
    expiry              TEXT NOT NULL,
    option_type         TEXT NOT NULL,
    contract_symbol     TEXT,
    strike              REAL,
    last_price          REAL,
    bid                 REAL,
    ask                 REAL,
    volume              INTEGER,
    open_interest       INTEGER,
    implied_volatility  REAL,
    in_the_money        INTEGER,
    delta               REAL,
    fetched_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_options ON options(symbol, expiry, fetched_at DESC);

CREATE TABLE IF NOT EXISTS scan_results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT NOT NULL,
    score           REAL,
    signal          TEXT,
    price           REAL,
    rsi             REAL,
    macd_signal     TEXT,
    trend           TEXT,
    volume_ratio    REAL,
    stop_loss       REAL,
    take_profit     REAL,
    reasons         TEXT,
    fetched_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scan ON scan_results(fetched_at DESC);

CREATE TABLE IF NOT EXISTS market_movers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mover_type   TEXT NOT NULL,
    symbol       TEXT NOT NULL,
    short_name   TEXT,
    price        REAL,
    change_pct   REAL,
    volume       INTEGER,
    avg_volume   INTEGER,
    vol_ratio    REAL,
    market_cap   REAL,
    fetched_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movers ON market_movers(mover_type, fetched_at DESC);

CREATE TABLE IF NOT EXISTS watchlists (
    name        TEXT PRIMARY KEY,
    symbols     TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_journal (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT NOT NULL,
    side        TEXT NOT NULL,
    qty         REAL NOT NULL,
    entry_price REAL NOT NULL,
    exit_price  REAL,
    entry_time  TEXT NOT NULL,
    exit_time   TEXT,
    notes       TEXT,
    tags        TEXT,
    pnl         REAL,
    pnl_pct     REAL,
    status      TEXT DEFAULT 'open',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal ON trade_journal(symbol, created_at DESC);
"""

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
