"""Stock quotes — Alpaca primary, yfinance fallback, SQLite cache."""
from datetime import datetime, timedelta
import yfinance as yf
from server.db import get_db

QUOTE_TTL = 60  # seconds

try:
    from alpaca.data import StockHistoricalDataClient
    from alpaca.data.requests import StockSnapshotRequest
    _ALPACA_OK = True
except ImportError:
    _ALPACA_OK = False


def _cutoff():
    return (datetime.utcnow() - timedelta(seconds=QUOTE_TTL)).isoformat()


def _read_cache(symbols: list[str], conn) -> dict:
    cut = _cutoff()
    result = {}
    for s in symbols:
        row = conn.execute(
            "SELECT * FROM quotes WHERE symbol=? AND fetched_at>? ORDER BY fetched_at DESC LIMIT 1",
            (s, cut)
        ).fetchone()
        if row:
            d = dict(row)
            result[s] = _row_to_quote(d)
    return result


def _row_to_quote(d: dict) -> dict:
    return {
        "symbol": d["symbol"],
        "shortName": d["short_name"] or d["symbol"],
        "regularMarketPrice": d["price"],
        "regularMarketChange": d["change_amt"],
        "regularMarketChangePercent": d["change_pct"],
        "regularMarketVolume": d["volume"],
        "regularMarketDayHigh": d["day_high"],
        "regularMarketDayLow": d["day_low"],
        "regularMarketPreviousClose": d["prev_close"],
        "marketCap": d["market_cap"],
        "trailingPE": d["pe_ratio"],
        "bid": d["bid"],
        "ask": d["ask"],
        "averageDailyVolume3Month": d["avg_volume"],
        "dataSource": d.get("data_source", "cache"),
    }


def _save(sym: str, q: dict, conn):
    now = datetime.utcnow().isoformat()
    conn.execute(
        """INSERT INTO quotes
           (symbol,short_name,price,change_amt,change_pct,volume,day_high,day_low,
            prev_close,market_cap,pe_ratio,bid,ask,avg_volume,data_source,fetched_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (sym, q.get("shortName"), q.get("regularMarketPrice"), q.get("regularMarketChange"),
         q.get("regularMarketChangePercent"), q.get("regularMarketVolume"),
         q.get("regularMarketDayHigh"), q.get("regularMarketDayLow"),
         q.get("regularMarketPreviousClose"), q.get("marketCap"),
         q.get("trailingPE"), q.get("bid"), q.get("ask"),
         q.get("averageDailyVolume3Month"), q.get("dataSource"), now)
    )
    conn.commit()


def _from_alpaca(symbols: list[str], api_key: str, secret: str) -> dict:
    if not _ALPACA_OK or not api_key:
        return {}
    stocks = [s for s in symbols if not s.startswith("^")]
    if not stocks:
        return {}
    try:
        client = StockHistoricalDataClient(api_key=api_key, secret_key=secret)
        snaps = client.get_stock_snapshot(StockSnapshotRequest(symbol_or_symbols=stocks))
        result = {}
        for sym, snap in snaps.items():
            try:
                daily = getattr(snap, 'daily_bar',      None)
                prev  = getattr(snap, 'prev_daily_bar', None)
                qt    = getattr(snap, 'latest_quote',   None)
                price     = float(daily.close) if daily else (float(prev.close) if prev else None)
                prev_c    = float(prev.close)  if prev else None
                change    = (price - prev_c)              if price and prev_c else None
                change_pct = (change / prev_c * 100)      if change and prev_c else None
                result[sym] = {
                    "symbol": sym,
                    "shortName": sym,
                    "regularMarketPrice": price,
                    "regularMarketChange": change,
                    "regularMarketChangePercent": change_pct,
                    "regularMarketVolume": int(daily.volume) if daily and daily.volume else None,
                    "regularMarketDayHigh": float(daily.high) if daily else None,
                    "regularMarketDayLow":  float(daily.low)  if daily else None,
                    "regularMarketPreviousClose": prev_c,
                    "bid": float(qt.bid_price) if qt and qt.bid_price else None,
                    "ask": float(qt.ask_price) if qt and qt.ask_price else None,
                    "marketCap": None, "trailingPE": None, "averageDailyVolume3Month": None,
                    "dataSource": "Alpaca",
                }
            except Exception as e:
                print(f"[quotes/alpaca] {sym}: {e}")
        return result
    except Exception as e:
        print(f"[quotes/alpaca] batch error: {e}")
        return {}


def _fetch_one_yf(sym: str) -> tuple[str, dict | None]:
    """Fetch a single symbol from yfinance — runs in a thread."""
    try:
        t    = yf.Ticker(sym)
        hist = t.history(period="5d", interval="1d", auto_adjust=True)
        hist = hist.dropna(subset=["Close"])
        if hist.empty:
            return sym, None
        price  = float(hist["Close"].iloc[-1])
        prev_c = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else None
        change  = (price - prev_c) if prev_c else None
        chg_pct = (change / prev_c * 100) if change and prev_c else None
        vol     = int(hist["Volume"].iloc[-1]) if "Volume" in hist.columns else None
        return sym.upper(), {
            "symbol": sym.upper(), "shortName": sym.upper(),
            "regularMarketPrice": price,
            "regularMarketChange": change,
            "regularMarketChangePercent": chg_pct,
            "regularMarketVolume": vol,
            "regularMarketDayHigh": float(hist["High"].iloc[-1]) if "High" in hist.columns else None,
            "regularMarketDayLow":  float(hist["Low"].iloc[-1])  if "Low"  in hist.columns else None,
            "regularMarketPreviousClose": prev_c,
            "marketCap": None, "trailingPE": None,
            "bid": None, "ask": None, "averageDailyVolume3Month": None,
            "dataSource": "yfinance",
        }
    except Exception as e:
        print(f"[quotes/yf] {sym}: {e}")
        return sym, None


def _from_yfinance(symbols: list[str]) -> dict:
    if not symbols:
        return {}
    from concurrent.futures import ThreadPoolExecutor, as_completed
    result = {}
    with ThreadPoolExecutor(max_workers=min(len(symbols), 10)) as pool:
        futures = {pool.submit(_fetch_one_yf, s): s for s in symbols}
        for fut in as_completed(futures, timeout=20):
            try:
                sym, data = fut.result()
                if data:
                    result[sym] = data
            except Exception:
                pass
    return result


def get_quotes(symbols: list[str], alpaca_key: str = "", alpaca_secret: str = "") -> dict:
    symbols = [s.upper() for s in symbols if s]
    if not symbols:
        return {}
    conn = get_db()
    try:
        cached  = _read_cache(symbols, conn)
        missing = [s for s in symbols if s not in cached]
        if not missing:
            return cached

        fresh = _from_alpaca(missing, alpaca_key, alpaca_secret)

        # After hours Alpaca returns price but no change% (prev_daily_bar is None).
        # Supplement those symbols with yfinance which computes change% from 2-day history.
        incomplete = [s for s in fresh if fresh[s].get("regularMarketChangePercent") is None]
        still = [s for s in missing if s not in fresh]
        need_yf = list(set(incomplete + still))
        if need_yf:
            yf_data = _from_yfinance(need_yf)
            for s, data in yf_data.items():
                # For symbols Alpaca got price for, merge yfinance change data in
                if s in fresh and data:
                    fresh[s]["regularMarketChange"]        = data["regularMarketChange"]
                    fresh[s]["regularMarketChangePercent"] = data["regularMarketChangePercent"]
                    fresh[s]["regularMarketPreviousClose"] = data["regularMarketPreviousClose"]
                elif data:
                    fresh[s] = data

        for sym, q in fresh.items():
            try:
                _save(sym, q, conn)
            except Exception:
                pass

        return {**cached, **fresh}
    finally:
        conn.close()
