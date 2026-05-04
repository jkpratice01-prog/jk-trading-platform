"""
Economic calendar — hardcoded macro events + earnings fetched from yfinance.
Results cached in SQLite for 2 hours so Railway's 30s proxy timeout isn't hit.
"""
import json
import pandas as pd
from datetime import datetime, date, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from server.db import get_db
from server.services.yf_session import ticker as yf_ticker

CACHE_TTL_SECONDS = 7200  # 2 hours

# ── Hardcoded 2026 macro events ───────────────────────────────────────────────
MACRO_2026 = [
    {"date": "2026-06-10", "event": "FOMC Rate Decision",         "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    {"date": "2026-07-29", "event": "FOMC Rate Decision",         "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    {"date": "2026-09-16", "event": "FOMC Rate Decision",         "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    {"date": "2026-10-28", "event": "FOMC Rate Decision",         "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    {"date": "2026-12-09", "event": "FOMC Rate Decision",         "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    {"date": "2026-05-20", "event": "FOMC Minutes (Apr 28-29)",   "category": "FED",       "impact": "MED",  "note": ""},
    {"date": "2026-07-01", "event": "FOMC Minutes (Jun 9-10)",    "category": "FED",       "impact": "MED",  "note": ""},
    {"date": "2026-05-12", "event": "CPI Inflation (Apr)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-06-11", "event": "CPI Inflation (May)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-07-14", "event": "CPI Inflation (Jun)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-08-12", "event": "CPI Inflation (Jul)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-09-10", "event": "CPI Inflation (Aug)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-10-13", "event": "CPI Inflation (Sep)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-11-12", "event": "CPI Inflation (Oct)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-12-10", "event": "CPI Inflation (Nov)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-05-13", "event": "PPI (Apr)",                  "category": "INFLATION", "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-06-12", "event": "PPI (May)",                  "category": "INFLATION", "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-07-15", "event": "PPI (Jun)",                  "category": "INFLATION", "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-08-13", "event": "PPI (Jul)",                  "category": "INFLATION", "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-06-05", "event": "Non-Farm Payrolls (May)",    "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-07-02", "event": "Non-Farm Payrolls (Jun)",    "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-08-07", "event": "Non-Farm Payrolls (Jul)",    "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-09-04", "event": "Non-Farm Payrolls (Aug)",    "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-10-02", "event": "Non-Farm Payrolls (Sep)",    "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-11-06", "event": "Non-Farm Payrolls (Oct)",    "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-12-04", "event": "Non-Farm Payrolls (Nov)",    "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-05-29", "event": "PCE Inflation (Apr)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-06-26", "event": "PCE Inflation (May)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-07-31", "event": "PCE Inflation (Jun)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-08-28", "event": "PCE Inflation (Jul)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-09-25", "event": "PCE Inflation (Aug)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-10-30", "event": "PCE Inflation (Sep)",        "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-05-28", "event": "GDP Q1 2026 (2nd Estimate)", "category": "GDP",       "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-07-29", "event": "GDP Q2 2026 (Advance)",      "category": "GDP",       "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-10-28", "event": "GDP Q3 2026 (Advance)",      "category": "GDP",       "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-05-15", "event": "Retail Sales (Apr)",         "category": "CONSUMER",  "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-06-16", "event": "Retail Sales (May)",         "category": "CONSUMER",  "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-07-16", "event": "Retail Sales (Jun)",         "category": "CONSUMER",  "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-08-14", "event": "Retail Sales (Jul)",         "category": "CONSUMER",  "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-08-27", "event": "Jackson Hole Symposium",     "category": "FED",       "impact": "HIGH", "note": "Fed chair speech often market-moving"},
]

EARNINGS_SYMBOLS = [
    'AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','AMD','PLTR','COIN',
    'NFLX','CRM','ORCL','UBER','DIS','JPM','BAC','GS','V','MA',
    'XOM','CVX','UNH','LLY','PFE','ABBV','MRNA','WMT','COST','NKE',
    'MU','AMAT','TXN','SOFI','INTC','QCOM','AVGO','ADBE','NOW','SHOP',
]


# ── SQLite cache helpers ──────────────────────────────────────────────────────

def _ensure_cache_table():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS calendar_cache (
            key        TEXT PRIMARY KEY,
            payload    TEXT NOT NULL,
            fetched_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def _read_cache(key: str) -> dict | None:
    try:
        conn  = get_db()
        row   = conn.execute(
            "SELECT payload, fetched_at FROM calendar_cache WHERE key=?", (key,)
        ).fetchone()
        conn.close()
        if not row:
            return None
        fetched = datetime.fromisoformat(row['fetched_at']).replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - fetched).total_seconds() > CACHE_TTL_SECONDS:
            return None
        return json.loads(row['payload'])
    except Exception:
        return None


def _write_cache(key: str, data: dict):
    try:
        conn = get_db()
        conn.execute(
            "INSERT OR REPLACE INTO calendar_cache (key, payload, fetched_at) VALUES (?,?,?)",
            (key, json.dumps(data), datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


# ── Earnings fetch ────────────────────────────────────────────────────────────

def _fetch_earnings(symbol: str, days_ahead: int) -> dict | None:
    try:
        t  = yf_ticker(symbol)
        ed = t.earnings_dates
        if ed is None or ed.empty:
            return None
        now    = pd.Timestamp.now(tz='UTC')
        cutoff = now + pd.Timedelta(days=days_ahead)
        future = ed[(ed.index.normalize() >= now.normalize()) & (ed.index <= cutoff)]
        if future.empty:
            return None
        dt   = future.index[-1]
        days = max(0, (dt.date() - now.date()).days)
        row  = future.iloc[-1]
        eps  = row.get('EPS Estimate')
        return {
            'symbol':      symbol,
            'date':        dt.strftime('%Y-%m-%d'),
            'daysAway':    days,
            'epsEstimate': round(float(eps), 2) if eps and str(eps) != 'nan' else None,
            'type':        'EARNINGS',
            'category':    'EARNINGS',
            'impact':      'HIGH',
        }
    except Exception:
        return None


# ── Main function ─────────────────────────────────────────────────────────────

def get_calendar(days_ahead: int = 60) -> dict:
    _ensure_cache_table()
    cache_key = f'calendar_{days_ahead}'

    # Return from cache if fresh (avoids Railway's 30s timeout on repeat calls)
    cached = _read_cache(cache_key)
    if cached:
        cached['fromCache'] = True
        return cached

    today  = date.today()
    cutoff = pd.Timestamp(today) + pd.Timedelta(days=days_ahead)

    # Macro events (instant — hardcoded)
    macro = []
    for ev in MACRO_2026:
        ev_date = date.fromisoformat(ev['date'])
        if ev_date < today or ev_date > cutoff.date():
            continue
        days_away = (ev_date - today).days
        macro.append({**ev, 'daysAway': days_away, 'isToday': days_away == 0})

    # Earnings (slow — parallel yfinance fetches)
    earnings = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_earnings, s, days_ahead): s for s in EARNINGS_SYMBOLS}
        for fut in as_completed(futures, timeout=50):
            try:
                r = fut.result()
                if r:
                    earnings.append(r)
            except Exception:
                pass

    all_events = macro + earnings
    all_events.sort(key=lambda x: (x['daysAway'], x.get('impact', 'Z')))
    today_events = [e for e in all_events if e.get('daysAway', 1) == 0]

    result = {
        'events':      all_events,
        'todayEvents': today_events,
        'fetchedAt':   datetime.utcnow().isoformat(),
        'daysAhead':   days_ahead,
        'fromCache':   False,
    }

    _write_cache(cache_key, result)
    return result
