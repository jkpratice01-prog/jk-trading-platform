"""Pre-market gap scanner — finds largest gap-up/down movers before open."""
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

UNIVERSE = [
    'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','PLTR','COIN',
    'JPM','BAC','GS','MS','WFC','V','MA','XOM','CVX','OXY',
    'LLY','MRNA','PFE','ABBV','UNH','NFLX','CRM','SNOW','DDOG','NET',
    'CRWD','PANW','MSTR','HOOD','RIVN','NIO','LCID','SOFI','AFRM','UPST',
    'SPY','QQQ','IWM','SQQQ','TQQQ','UVXY','VXX',
    'ORCL','ADBE','NOW','SHOP','SQ','PYPL','UBER','LYFT','ABNB','DASH',
    'EBAY','ETSY','AMGN','GILD','BMY','MRK','JNJ','CVS','WMT','TGT',
]


def _fetch_gap(sym: str) -> dict | None:
    try:
        t    = yf.Ticker(sym)
        info = t.info
        pre  = info.get('preMarketPrice') or info.get('currentPrice') or info.get('regularMarketPrice')
        prev = info.get('previousClose') or info.get('regularMarketPreviousClose')
        reg  = info.get('regularMarketPrice') or info.get('currentPrice')
        vol  = info.get('preMarketVolume') or info.get('regularMarketVolume') or 0
        name = info.get('shortName') or sym
        if not pre or not prev:
            return None
        gap_pct = (pre - prev) / prev * 100
        return {
            'symbol':    sym,
            'shortName': name,
            'prePrice':  round(float(pre), 2),
            'prevClose': round(float(prev), 2),
            'regPrice':  round(float(reg), 2) if reg else None,
            'gapPct':    round(gap_pct, 2),
            'gapAmt':    round(float(pre - prev), 2),
            'volume':    int(vol),
            'direction': 'up' if gap_pct > 0 else 'down',
        }
    except Exception:
        return None


def get_premarket_movers(limit: int = 30) -> dict:
    results = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(_fetch_gap, s): s for s in UNIVERSE}
        for fut in as_completed(futures, timeout=25):
            r = fut.result()
            if r and abs(r['gapPct']) >= 0.3:
                results.append(r)
    results.sort(key=lambda x: abs(x['gapPct']), reverse=True)
    return {
        'gapUps':    [r for r in results if r['gapPct'] > 0][:limit],
        'gapDowns':  [r for r in results if r['gapPct'] < 0][:limit],
        'scannedAt': datetime.utcnow().isoformat(),
        'total':     len(results),
    }
