"""Market movers — top gainers and losers via yfinance."""
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from server.db import get_db

MOVER_UNIVERSE = [
    'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','PLTR','COIN',
    'JPM','BAC','GS','V','MA','XOM','CVX','OXY','LLY','MRNA',
    'NFLX','CRM','SNOW','DDOG','NET','CRWD','SHOP','MSTR','HOOD','SOFI',
    'SPY','QQQ','IWM','UBER','ABNB','BKNG','AFRM','UPST','SQ','PYPL',
]


def _fetch_quote(sym: str) -> dict | None:
    try:
        t    = yf.Ticker(sym)
        info = t.fast_info
        price = float(info.last_price or 0)
        prev  = float(info.previous_close or 0)
        if not price or not prev:
            return None
        chg_pct = (price - prev) / prev * 100
        vol     = int(info.three_month_average_volume or 0)
        avg_vol = int(info.three_month_average_volume or 0)
        last_vol = int(getattr(info, 'last_volume', 0) or 0)
        return {
            'symbol':                     sym,
            # Dashboard-compatible field names (same as Yahoo Finance quote shape)
            'regularMarketPrice':         round(price, 2),
            'regularMarketChangePercent': round(chg_pct, 2),
            'regularMarketVolume':        last_vol,
            'averageDailyVolume3Month':   avg_vol,
            'marketCap':                  float(getattr(info, 'market_cap', 0) or 0),
            # Extras for signal column
            'volRatio': round(last_vol / max(avg_vol, 1), 2),
        }
    except Exception:
        return None


def get_movers(limit: int = 12) -> dict:
    results = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        futs = {pool.submit(_fetch_quote, s): s for s in MOVER_UNIVERSE}
        for fut in as_completed(futs, timeout=25):
            r = fut.result()
            if r:
                results.append(r)

    results.sort(key=lambda x: x['regularMarketChangePercent'], reverse=True)
    gainers = results[:limit]
    losers  = list(reversed(results))[:limit]

    # Cache to DB
    try:
        conn = get_db()
        now  = datetime.utcnow().isoformat()
        conn.execute("DELETE FROM market_movers WHERE fetched_at < datetime('now','-1 hour')")
        for mtype, rows in [('gainer', gainers), ('loser', losers)]:
            for r in rows:
                conn.execute(
                    "INSERT INTO market_movers (mover_type,symbol,price,change_pct,volume,avg_volume,vol_ratio,market_cap,fetched_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?)",
                    (mtype, r['symbol'], r['regularMarketPrice'], r['regularMarketChangePercent'],
                     r['regularMarketVolume'], r['averageDailyVolume3Month'], r['volRatio'], r['marketCap'], now)
                )
        conn.commit()
        conn.close()
    except Exception:
        pass

    return {
        'gainers':   gainers,
        'losers':    losers,
        'fetchedAt': datetime.utcnow().isoformat(),
    }
