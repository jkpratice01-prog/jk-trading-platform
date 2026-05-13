"""Pre-market gap scanner — finds largest gap-up/down movers before open."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from server.services.yf_session import ticker as yf_ticker

UNIVERSE = [
    'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','PLTR','COIN',
    'JPM','BAC','GS','MS','WFC','V','MA','XOM','CVX','OXY',
    'LLY','MRNA','PFE','ABBV','UNH','NFLX','CRM','SNOW','DDOG','NET',
    'CRWD','PANW','MSTR','HOOD','RIVN','NIO','SOFI','AFRM','UPST',
    'SPY','QQQ','IWM','SQQQ','TQQQ',
    'ORCL','ADBE','NOW','SHOP','PYPL','UBER','ABNB','DASH',
    'AMGN','GILD','MRK','JNJ','WMT','TGT',
    'AVGO','QCOM','MU','ARM','SMCI','MRVL',
]


def _fetch_gap(sym: str) -> dict | None:
    try:
        t  = yf_ticker(sym)
        fi = t.fast_info

        last      = fi.last_price
        prev      = fi.previous_close
        open_     = getattr(fi, 'open', None)

        if not last or not prev or prev <= 0:
            return None

        # Pre-market / gap price: use today's open if available, else last price
        gap_price = open_ if open_ and open_ > 0 else last
        gap_pct   = (gap_price - prev) / prev * 100

        # Also show how much it's moved since open (intraday drift)
        intraday_pct = ((last - open_) / open_ * 100) if open_ and open_ > 0 else 0.0

        try:
            short_name = t.info.get('shortName') or sym
        except Exception:
            short_name = sym

        return {
            'symbol':       sym,
            'shortName':    short_name,
            'prePrice':     round(float(gap_price), 2),
            'prevClose':    round(float(prev), 2),
            'lastPrice':    round(float(last), 2),
            'gapPct':       round(gap_pct, 2),
            'gapAmt':       round(float(gap_price - prev), 2),
            'intradayPct':  round(intraday_pct, 2),
            'volume':       int(fi.last_volume or 0),
            'direction':    'up' if gap_pct > 0 else 'down',
        }
    except Exception:
        return None


def get_premarket_movers(limit: int = 30) -> dict:
    results = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(_fetch_gap, s): s for s in UNIVERSE}
        for fut in as_completed(futures, timeout=30):
            try:
                r = fut.result()
                if r and abs(r['gapPct']) >= 0.3:
                    results.append(r)
            except Exception:
                pass

    results.sort(key=lambda x: abs(x['gapPct']), reverse=True)
    return {
        'gapUps':    [r for r in results if r['gapPct'] > 0][:limit],
        'gapDowns':  [r for r in results if r['gapPct'] < 0][:limit],
        'scannedAt': datetime.utcnow().isoformat(),
        'total':     len(results),
    }