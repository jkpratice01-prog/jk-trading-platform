"""
Economic calendar service.

Returns hardcoded high-impact macro events (FOMC, CPI, NFP, PCE, GDP)
combined with upcoming earnings fetched from yfinance.
"""
import pandas as pd
from datetime import datetime, date
from concurrent.futures import ThreadPoolExecutor, as_completed
from server.services.yf_session import ticker as yf_ticker

# ── Hardcoded 2026 macro events ───────────────────────────────────────────────
# Dates sourced from Federal Reserve, BLS, and BEA published schedules.
MACRO_2026 = [
    # FOMC rate decisions (second day of each meeting)
    {"date": "2026-06-10", "event": "FOMC Rate Decision",        "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    {"date": "2026-07-29", "event": "FOMC Rate Decision",        "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    {"date": "2026-09-16", "event": "FOMC Rate Decision",        "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    {"date": "2026-10-28", "event": "FOMC Rate Decision",        "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    {"date": "2026-12-09", "event": "FOMC Rate Decision",        "category": "FED",       "impact": "HIGH", "note": "Press conference follows"},
    # FOMC Minutes (released ~3 weeks after each meeting)
    {"date": "2026-05-20", "event": "FOMC Minutes (Apr 28-29)",  "category": "FED",       "impact": "MED",  "note": ""},
    {"date": "2026-07-01", "event": "FOMC Minutes (Jun 9-10)",   "category": "FED",       "impact": "MED",  "note": ""},
    # CPI (Consumer Price Index) — BLS, ~2nd Tuesday of month
    {"date": "2026-05-12", "event": "CPI Inflation (Apr)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-06-11", "event": "CPI Inflation (May)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-07-14", "event": "CPI Inflation (Jun)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-08-12", "event": "CPI Inflation (Jul)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-09-10", "event": "CPI Inflation (Aug)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-10-13", "event": "CPI Inflation (Sep)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-11-12", "event": "CPI Inflation (Oct)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-12-10", "event": "CPI Inflation (Nov)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET"},
    # PPI (Producer Price Index) — BLS, day after CPI
    {"date": "2026-05-13", "event": "PPI (Apr)",                 "category": "INFLATION", "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-06-12", "event": "PPI (May)",                 "category": "INFLATION", "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-07-15", "event": "PPI (Jun)",                 "category": "INFLATION", "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-08-13", "event": "PPI (Jul)",                 "category": "INFLATION", "impact": "MED",  "note": "8:30 AM ET"},
    # NFP (Non-Farm Payrolls) — BLS, first Friday of month
    {"date": "2026-06-05", "event": "Non-Farm Payrolls (May)",   "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-07-02", "event": "Non-Farm Payrolls (Jun)",   "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-08-07", "event": "Non-Farm Payrolls (Jul)",   "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-09-04", "event": "Non-Farm Payrolls (Aug)",   "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-10-02", "event": "Non-Farm Payrolls (Sep)",   "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-11-06", "event": "Non-Farm Payrolls (Oct)",   "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-12-04", "event": "Non-Farm Payrolls (Nov)",   "category": "JOBS",      "impact": "HIGH", "note": "8:30 AM ET"},
    # PCE (Fed's preferred inflation) — BEA, ~last Friday of month
    {"date": "2026-05-29", "event": "PCE Inflation (Apr)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-06-26", "event": "PCE Inflation (May)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-07-31", "event": "PCE Inflation (Jun)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-08-28", "event": "PCE Inflation (Jul)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-09-25", "event": "PCE Inflation (Aug)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    {"date": "2026-10-30", "event": "PCE Inflation (Sep)",       "category": "INFLATION", "impact": "HIGH", "note": "8:30 AM ET · Fed's preferred gauge"},
    # GDP — BEA, Advance ~4 weeks after quarter end
    {"date": "2026-05-28", "event": "GDP Q1 2026 (2nd Estimate)", "category": "GDP",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-07-29", "event": "GDP Q2 2026 (Advance)",      "category": "GDP",      "impact": "HIGH", "note": "8:30 AM ET"},
    {"date": "2026-10-28", "event": "GDP Q3 2026 (Advance)",      "category": "GDP",      "impact": "HIGH", "note": "8:30 AM ET"},
    # Retail Sales — Census Bureau, ~15th of month
    {"date": "2026-05-15", "event": "Retail Sales (Apr)",        "category": "CONSUMER",  "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-06-16", "event": "Retail Sales (May)",        "category": "CONSUMER",  "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-07-16", "event": "Retail Sales (Jun)",        "category": "CONSUMER",  "impact": "MED",  "note": "8:30 AM ET"},
    {"date": "2026-08-14", "event": "Retail Sales (Jul)",        "category": "CONSUMER",  "impact": "MED",  "note": "8:30 AM ET"},
    # Jackson Hole (annual Fed symposium, late August)
    {"date": "2026-08-27", "event": "Jackson Hole Symposium",    "category": "FED",       "impact": "HIGH", "note": "Fed chair speech often market-moving"},
]

EARNINGS_SYMBOLS = [
    'AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','AMD','INTC','QCOM',
    'AVGO','ORCL','CRM','ADBE','NOW','PLTR','COIN','UBER','NFLX','DIS',
    'JPM','BAC','GS','MS','V','MA','AXP','C',
    'XOM','CVX','COP',
    'UNH','LLY','PFE','JNJ','ABBV','MRNA',
    'WMT','COST','TGT','HD','NKE','SBUX','MCD',
    'MU','AMAT','TXN','SOFI',
]


def _fetch_earnings(symbol: str, days_ahead: int) -> dict | None:
    try:
        t   = yf_ticker(symbol)
        ed  = t.earnings_dates
        if ed is None or ed.empty:
            return None
        now    = pd.Timestamp.now(tz='UTC')
        cutoff = now + pd.Timedelta(days=days_ahead)
        future = ed[(ed.index > now) & (ed.index <= cutoff)]
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


def get_calendar(days_ahead: int = 60) -> dict:
    today = date.today()
    cutoff = pd.Timestamp(today) + pd.Timedelta(days=days_ahead)

    # ── Macro events ─────────────────────────────────────────────────────────
    macro = []
    for ev in MACRO_2026:
        ev_date = date.fromisoformat(ev['date'])
        if ev_date < today:
            continue
        if ev_date > cutoff.date():
            continue
        days_away = (ev_date - today).days
        macro.append({**ev, 'daysAway': days_away, 'isToday': days_away == 0})

    # ── Earnings ─────────────────────────────────────────────────────────────
    earnings = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(_fetch_earnings, s, days_ahead): s for s in EARNINGS_SYMBOLS}
        for fut in as_completed(futures, timeout=60):
            r = fut.result()
            if r:
                earnings.append(r)

    # ── Merge & sort ─────────────────────────────────────────────────────────
    all_events = macro + earnings
    all_events.sort(key=lambda x: (x['daysAway'], x.get('impact', 'Z')))

    today_events = [e for e in all_events if e.get('isToday') or e.get('daysAway') == 0]

    return {
        'events':      all_events,
        'todayEvents': today_events,
        'fetchedAt':   datetime.utcnow().isoformat(),
        'daysAhead':   days_ahead,
    }
