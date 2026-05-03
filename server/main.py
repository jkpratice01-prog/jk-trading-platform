"""FastAPI backend for trading platform."""
import os
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")  # load server/.env
load_dotenv()                                 # also load root .env (if any)

ALPACA_KEY    = os.getenv("ALPACA_API_KEY", "")
ALPACA_SECRET = os.getenv("ALPACA_SECRET_KEY", "")

from server.db import init_db, get_db

try:
    from server.services.quotes          import get_quotes
    from server.services.chart           import get_chart
    from server.services.options         import get_options_chain
    from server.services.movers          import get_movers
    from server.services.scanner         import scan_symbols, get_cached_scan
    from server.services.premarket       import get_premarket_movers
    from server.services.flow_scanner    import scan_unusual_flow
    from server.services.earnings_iv     import get_earnings_iv_analysis
    from server.services.intraday_scanner import scan_intraday
    from server.services.multi_timeframe  import get_multi_timeframe
    from server.services.pivots          import get_pivots
    from server.services.internals       import get_internals
    from server.services.trading         import (
        get_account, get_positions, get_orders, place_order, cancel_order, close_position
    )
    print("Core services imported successfully")
except Exception as e:
    print(f"CRITICAL: Core service import failed: {e}")
    import traceback; traceback.print_exc()
try:
    from server.services.institutions   import get_institutional_holders, get_major_holders
    print("Institutions imported successfully")
except Exception as e:
    print(f"Failed to import institutions: {e}")

try:
    from server.services.institutional_flow import get_institutional_flow, get_dark_pool_activity, get_block_trades
    print("Institutional flow imported successfully")
except Exception as e:
    print(f"Failed to import institutional flow: {e}")

try:
    from server.services.earnings_flow import scan_earnings_flow
    print("Earnings flow imported successfully")
except Exception as e:
    print(f"Failed to import earnings flow: {e}")

try:
    from server.services.deep_info import get_deep_info
    print("Deep info imported successfully")
except Exception as e:
    print(f"Failed to import deep info: {e}")

try:
    from server.services.economic_calendar import get_calendar
    from server.services.earnings_history  import get_earnings_history
    print("Calendar & earnings history imported successfully")
except Exception as e:
    print(f"Failed to import calendar/earnings history: {e}")

try:
    from server.services.crypto import get_crypto_overview, get_top_coins, get_coin_info
    print("Crypto service imported successfully")
except Exception as e:
    print(f"Failed to import crypto service: {e}")

try:
    from server.services.holdings import (
        get_holdings, get_holding_detail, add_holding, update_holding,
        delete_holding, get_price_history, refresh_all_prices, start_price_refresh_job
    )
    print("Holdings imported successfully")
except Exception as e:
    print(f"Failed to import holdings: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=== STARTUP BEGIN ===")
    try:
        init_db()
        print("DB initialised OK")
    except Exception as e:
        print(f"CRITICAL: DB init failed: {e}")
        import traceback; traceback.print_exc()
    try:
        from server.services.holdings import init_tables as holdings_init, start_price_refresh_job
        holdings_init()
        start_price_refresh_job(3600)
        print("Holdings init OK")
    except Exception as e:
        print(f"Holdings init error: {e}")
        import traceback; traceback.print_exc()
    # Pre-warm options cache in background so first user request is fast
    import threading
    def _prewarm():
        try:
            for sym in ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA']:
                try:
                    get_options_chain(sym)
                    print(f"[prewarm] options cached: {sym}")
                except Exception:
                    pass
        except Exception as e:
            print(f"[prewarm] error: {e}")
    threading.Thread(target=_prewarm, daemon=True).start()

    print("=== STARTUP COMPLETE ===")
    yield


app = FastAPI(title="Trading Platform API", lifespan=lifespan)

_ALLOWED_ORIGINS = [
    "http://localhost:5174", "http://localhost:3000", "http://localhost:5173",
    "https://jk-trading-platform-jkpratice01-progs-projects.vercel.app",
    "https://jk-trading-platform.vercel.app",
]
# Allow all origins when CORS_ORIGIN=* env var is set (useful during setup)
if os.getenv("CORS_ORIGIN") == "*":
    _ALLOWED_ORIGINS = ["*"]
elif os.getenv("CORS_ORIGIN"):
    _ALLOWED_ORIGINS.append(os.getenv("CORS_ORIGIN"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "alpaca": bool(ALPACA_KEY)}


# ── Quotes ────────────────────────────────────────────────────────────────────

@app.get("/api/quotes")
async def quotes(symbols: str = Query(..., description="Comma-separated tickers")):
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms:
        raise HTTPException(400, "No symbols provided")
    result = await asyncio.to_thread(get_quotes, syms, ALPACA_KEY, ALPACA_SECRET)
    return {"data": result}


@app.get("/api/quote/{symbol}")
async def quote(symbol: str):
    result = await asyncio.to_thread(get_quotes, [symbol.upper()], ALPACA_KEY, ALPACA_SECRET)
    q = result.get(symbol.upper())
    if not q:
        raise HTTPException(404, f"No data for {symbol}")
    return q


# ── Chart ─────────────────────────────────────────────────────────────────────

@app.get("/api/chart/{symbol}")
async def chart(symbol: str, days: int = 60, interval: str = "1d"):
    result = await asyncio.to_thread(
        get_chart, symbol.upper(), days, interval, ALPACA_KEY, ALPACA_SECRET
    )
    if not result.get("close"):
        raise HTTPException(404, f"No chart data for {symbol}")
    return result


# ── Market movers ─────────────────────────────────────────────────────────────

@app.get("/api/movers")
async def movers(limit: int = 12):
    result = await asyncio.to_thread(get_movers, limit)
    return result


# ── Options ──────────────────────────────────────────────────────────────────

@app.get("/api/options/{symbol}")
async def options(symbol: str, expiry: str | None = None):
    result = await asyncio.to_thread(get_options_chain, symbol.upper(), expiry)
    if not result:
        raise HTTPException(404, f"No options data for {symbol}")
    return result


@app.get("/api/options/{symbol}/contract/history")
async def contract_history(symbol: str, contract_symbol: str, expiry: str | None = None):
    """
    Return all DB snapshots for a specific contract — for trend charting.
    Always fetches fresh data first (saves new snapshot to DB) so the chart
    ends with the current live price, then returns the full history.
    """
    # Step 1: force a fresh yfinance fetch so a new DB snapshot is always written
    await asyncio.to_thread(get_options_chain, symbol.upper(), expiry, True)

    # Step 2: read all historical snapshots from DB (now includes the fresh one)
    conn = get_db()
    rows = conn.execute(
        """SELECT bid, ask, volume, open_interest, implied_volatility, fetched_at
           FROM options WHERE symbol=? AND contract_symbol=?
           ORDER BY fetched_at ASC""",
        (symbol.upper(), contract_symbol)
    ).fetchall()
    conn.close()

    snapshots = [dict(r) for r in rows]
    for s in snapshots:
        s["mid"] = round((s["bid"] + s["ask"]) / 2, 4) if s["bid"] and s["ask"] else None
        s["time_label"] = s["fetched_at"][11:16]  # HH:MM

    return {
        "contract_symbol": contract_symbol,
        "snapshots": snapshots,
        "source": "yfinance + db",
        "total_snapshots": len(snapshots),
    }


@app.get("/api/options/flow/batch")
async def options_flow_batch(symbols: str = Query(...)):
    """Bulk-fetch call/put flow from DB for multiple symbols in one query."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms:
        return {"flows": {}}

    conn = get_db()
    result = {}
    for sym in syms:
        rows = conn.execute(
            """SELECT option_type,
                      SUM(volume) as total_vol,
                      SUM(open_interest) as total_oi,
                      SUM(COALESCE((bid+ask)/2.0, 0) * COALESCE(volume, 0) * 100) as premium
               FROM options
               WHERE symbol=?
                 AND fetched_at=(SELECT MAX(fetched_at) FROM options WHERE symbol=?)
               GROUP BY option_type""",
            (sym, sym)
        ).fetchall()
        if not rows:
            continue
        by_type = {r["option_type"]: dict(r) for r in rows}
        call = by_type.get("call", {})
        put  = by_type.get("put",  {})
        cv, pv = (call.get("total_vol") or 0), (put.get("total_vol") or 0)
        co, po = (call.get("total_oi")  or 0), (put.get("total_oi")  or 0)
        cp, pp = (call.get("premium")   or 0), (put.get("premium")   or 0)
        result[sym] = {
            "symbol": sym,
            "callVolume": cv, "putVolume": pv,
            "callOI": co,    "putOI": po,
            "callPremium": round(cp), "putPremium": round(pp),
            "pcVolumeRatio": round(pv / cv, 3) if cv > 0 else None,
            "pcOIRatio":     round(po / co, 3) if co > 0 else None,
            "bias": "CALL" if cv > pv else ("PUT" if pv > cv else "NEUTRAL"),
        }
    conn.close()
    return {"flows": result}


@app.get("/api/options/{symbol}/flow")
async def options_flow(symbol: str):
    """Real call vs put flow from latest DB snapshot for this symbol."""
    conn = get_db()
    rows = conn.execute(
        """SELECT option_type,
                  SUM(volume) as total_vol,
                  SUM(open_interest) as total_oi,
                  SUM(COALESCE((bid+ask)/2.0, 0) * COALESCE(volume, 0) * 100) as premium
           FROM options
           WHERE symbol=?
             AND fetched_at=(SELECT MAX(fetched_at) FROM options WHERE symbol=?)
           GROUP BY option_type""",
        (symbol.upper(), symbol.upper())
    ).fetchall()
    conn.close()

    by_type = {r["option_type"]: dict(r) for r in rows}
    call = by_type.get("call", {})
    put  = by_type.get("put",  {})
    cv, pv = (call.get("total_vol") or 0), (put.get("total_vol") or 0)
    co, po = (call.get("total_oi")  or 0), (put.get("total_oi")  or 0)
    cp, pp = (call.get("premium")   or 0), (put.get("premium")   or 0)
    return {
        "symbol": symbol.upper(),
        "callVolume": cv, "putVolume": pv,
        "callOI": co, "putOI": po,
        "callPremium": round(cp), "putPremium": round(pp),
        "pcVolumeRatio": round(pv / cv, 3) if cv > 0 else None,
        "pcOIRatio":     round(po / co, 3) if co > 0 else None,
        "bias": "CALL" if cv > pv else ("PUT" if pv > cv else "NEUTRAL"),
    }


# ── Earnings calendar ─────────────────────────────────────────────────────────

_earnings_cache: dict = {}   # {sym: (result_or_None, timestamp)}
_EARNINGS_TTL = 3600        # 1 hour

@app.get("/api/earnings")
async def earnings_calendar(symbols: str = Query(...)):
    """Upcoming earnings for a list of symbols — yfinance earnings_dates."""
    import time, pandas as pd
    from concurrent.futures import ThreadPoolExecutor, as_completed

    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    def _fetch(sym):
        now_ts = time.time()
        if sym in _earnings_cache:
            res, ts = _earnings_cache[sym]
            if now_ts - ts < _EARNINGS_TTL:
                return res
        try:
            from server.services.yf_session import ticker as yf_ticker
            t  = yf_ticker(sym)
            ed = t.earnings_dates
            if ed is None or ed.empty:
                return None
            now    = pd.Timestamp.now(tz="UTC")
            cutoff = now + pd.Timedelta(days=35)   # next 5 weeks
            future = ed[(ed.index > now) & (ed.index <= cutoff)]
            if future.empty:
                return None
            row    = future.iloc[-1]
            dt     = future.index[-1]
            eps    = row.get("EPS Estimate")
            result = {
                "symbol":      sym,
                "date":        dt.strftime("%b %d"),
                "dateIso":     dt.isoformat()[:10],
                "daysAway":    (dt.date() - now.date()).days,
                "epsEstimate": round(float(eps), 2) if eps and str(eps) != "nan" else None,
                "when":        "AMC",
            }
            _earnings_cache[sym] = (result, time.time())
            return result
        except Exception:
            _earnings_cache[sym] = (None, time.time())
            return None

    results = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_fetch, s): s for s in syms}
        for fut in as_completed(futures, timeout=25):
            try:
                r = fut.result()
                if r:
                    results.append(r)
            except Exception:
                pass

    results.sort(key=lambda r: r["daysAway"])
    return {"earnings": results}


# ── IV Rank ───────────────────────────────────────────────────────────────────

@app.get("/api/options/{symbol}/ivrank")
async def iv_rank(symbol: str):
    """Real IVR (0-100) computed from historical ATM IV snapshots in DB."""
    conn = get_db()
    # Get average IV per snapshot timestamp (proxy for ATM IV history)
    rows = conn.execute(
        """SELECT fetched_at, AVG(implied_volatility) as avg_iv
           FROM options WHERE symbol=? AND implied_volatility > 0
           GROUP BY fetched_at ORDER BY fetched_at ASC""",
        (symbol.upper(),)
    ).fetchall()
    conn.close()

    if not rows:
        return {"ivr": None, "snapshots": 0, "message": "No IV history yet — open options chain to start capturing"}

    ivs = [r["avg_iv"] for r in rows]
    current = ivs[-1]
    lo, hi  = min(ivs), max(ivs)
    ivr = round((current - lo) / (hi - lo) * 100, 1) if hi != lo else 50.0
    return {
        "symbol": symbol.upper(),
        "ivr": ivr,
        "currentIV": round(current * 100, 1),
        "minIV": round(lo * 100, 1),
        "maxIV": round(hi * 100, 1),
        "snapshots": len(ivs),
        "label": "High" if ivr > 70 else "Low" if ivr < 30 else "Normal",
    }


# ── OI Wall ───────────────────────────────────────────────────────────────────

@app.get("/api/options/{symbol}/oi-wall")
async def oi_wall(symbol: str, expiry: str | None = None):
    """OI by strike grouped into calls (green) and puts (red) for the wall chart."""
    conn = get_db()
    q = "SELECT strike, option_type, SUM(open_interest) as oi FROM options WHERE symbol=?"
    params = [symbol.upper()]
    if expiry:
        q += " AND expiry=?"
        params.append(expiry)
    q += " AND fetched_at=(SELECT MAX(fetched_at) FROM options WHERE symbol=?) GROUP BY strike, option_type"
    params.append(symbol.upper())
    rows = conn.execute(q, params).fetchall()
    conn.close()

    by_strike: dict = {}
    for r in rows:
        s = r["strike"]
        if s not in by_strike:
            by_strike[s] = {"strike": s, "callOI": 0, "putOI": 0}
        if r["option_type"] == "call":
            by_strike[s]["callOI"] = int(r["oi"] or 0)
        else:
            by_strike[s]["putOI"]  = int(r["oi"] or 0)

    wall = sorted(by_strike.values(), key=lambda x: x["strike"])
    return {"symbol": symbol.upper(), "expiry": expiry, "wall": wall}


# ── OI Changes ────────────────────────────────────────────────────────────────

@app.get("/api/options/{symbol}/oi-changes")
async def oi_changes(symbol: str, expiry: str | None = None):
    """Diff last 2 DB snapshots — shows which strikes gained/lost OI (new positioning)."""
    conn = get_db()
    base = "SELECT DISTINCT fetched_at FROM options WHERE symbol=?"
    params = [symbol.upper()]
    if expiry:
        base += " AND expiry=?"
        params.append(expiry)
    times = conn.execute(base + " ORDER BY fetched_at DESC LIMIT 2", params).fetchall()

    if len(times) < 2:
        conn.close()
        return {"changes": [], "message": "Need at least 2 snapshots — open chain again after a few minutes"}

    t_curr, t_prev = times[0]["fetched_at"], times[1]["fetched_at"]

    def get_snap(t):
        p = [symbol.upper(), t]
        q2 = "SELECT contract_symbol, strike, option_type, open_interest FROM options WHERE symbol=? AND fetched_at=?"
        if expiry:
            q2 += " AND expiry=?"
            p.append(expiry)
        return {r["contract_symbol"]: dict(r) for r in conn.execute(q2, p).fetchall()}

    curr_map = get_snap(t_curr)
    prev_map = get_snap(t_prev)
    conn.close()

    changes = []
    for csym, r in curr_map.items():
        prev_oi = (prev_map.get(csym) or {}).get("open_interest") or 0
        curr_oi = r["open_interest"] or 0
        delta   = curr_oi - prev_oi
        if delta != 0:
            changes.append({
                "contractSymbol": csym,
                "strike":   r["strike"],
                "type":     r["option_type"],
                "prevOI":   prev_oi,
                "currOI":   curr_oi,
                "deltaOI":  delta,
                "pctChange": round(delta / max(prev_oi, 1) * 100, 1),
                "signal":   "opening" if delta > 0 else "closing",
            })

    changes.sort(key=lambda x: abs(x["deltaOI"]), reverse=True)
    return {
        "symbol": symbol.upper(),
        "changes": changes[:40],
        "prevTime": t_prev[:19],
        "currTime": t_curr[:19],
        "totalChanged": len(changes),
    }


# ── News ─────────────────────────────────────────────────────────────────────

@app.get("/api/news/{symbol}")
async def news(symbol: str, limit: int = 8):
    import yfinance as yf
    def _fetch():
        items = []
        try:
            raw = yf.Ticker(symbol.upper()).news or []
            for n in raw[:limit]:
                c     = n.get("content", n)
                title = c.get("title", "")
                if not title:
                    continue
                cp  = c.get("canonicalUrl") or c.get("clickThroughUrl") or {}
                url = cp.get("url", "") if isinstance(cp, dict) else ""
                pub = c.get("provider", {}).get("displayName", "") if isinstance(c.get("provider"), dict) else ""
                ts  = c.get("pubDate", "")
                items.append({"title": title, "link": url, "publisher": pub, "publishedAt": ts})
        except Exception:
            pass
        return items
    result = await asyncio.to_thread(_fetch)
    return {"news": result, "symbol": symbol.upper()}


# ── Pivot points ─────────────────────────────────────────────────────────────

@app.get("/api/chart/{symbol}/pivots")
async def pivots(symbol: str):
    result = await asyncio.to_thread(get_pivots, symbol.upper())
    return result


# ── Market internals ──────────────────────────────────────────────────────────

@app.get("/api/internals")
async def internals():
    result = await asyncio.to_thread(get_internals)
    return result


# ── VWAP ─────────────────────────────────────────────────────────────────────

@app.get("/api/chart/{symbol}/vwap")
async def vwap_chart(symbol: str):
    """Today's intraday 5-min bars with running VWAP."""
    import math
    result = await asyncio.to_thread(get_chart, symbol.upper(), 1, "5m", ALPACA_KEY, ALPACA_SECRET)
    if not result or not result.get("close"):
        raise HTTPException(404, "No intraday data")

    closes = result["close"]
    highs  = result["high"]
    lows   = result["low"]
    vols   = result["volume"]
    times  = result["timestamps"]

    cum_pv, cum_vol = 0.0, 0.0
    vwap_vals = []
    for h, l, c, v in zip(highs, lows, closes, vols):
        typical = (h + l + c) / 3
        cum_pv  += typical * (v or 0)
        cum_vol += (v or 0)
        vwap_vals.append(round(cum_pv / cum_vol, 4) if cum_vol > 0 else c)

    current_price = closes[-1] if closes else None
    current_vwap  = vwap_vals[-1] if vwap_vals else None
    deviation_pct = round((current_price - current_vwap) / current_vwap * 100, 2) if current_price and current_vwap else None

    return {
        "symbol": symbol.upper(),
        "timestamps": times,
        "close":  closes,
        "high":   highs,
        "low":    lows,
        "volume": vols,
        "vwap":   vwap_vals,
        "currentPrice": current_price,
        "currentVWAP":  current_vwap,
        "deviationPct": deviation_pct,
        "signal": "above" if (deviation_pct or 0) > 0 else "below",
    }


# ── Scanner ───────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    symbols: list[str]
    min_score: float = 0


@app.post("/api/scan")
async def scan(req: ScanRequest, background_tasks: BackgroundTasks):
    """Run scanner synchronously (use for <30 symbols)."""
    if len(req.symbols) > 50:
        raise HTTPException(400, "Max 50 symbols per scan request")
    results = await asyncio.to_thread(
        scan_symbols, req.symbols, ALPACA_KEY, ALPACA_SECRET, req.min_score
    )
    return {"results": results, "count": len(results)}


@app.get("/api/scan/cached")
async def scan_cached(min_score: float = 0):
    """Return most recent cached scan results."""
    return {"results": get_cached_scan(min_score)}


# ── Watchlists ────────────────────────────────────────────────────────────────

import json
from server.db import get_db
from datetime import datetime

@app.get("/api/watchlists")
def list_watchlists():
    conn = get_db()
    rows = conn.execute("SELECT name, symbols, updated_at FROM watchlists ORDER BY name").fetchall()
    conn.close()
    return [{"name": r["name"], "symbols": json.loads(r["symbols"]), "updatedAt": r["updated_at"]} for r in rows]


class WatchlistBody(BaseModel):
    name: str
    symbols: list[str]

@app.post("/api/watchlists")
def save_watchlist(body: WatchlistBody):
    conn = get_db()
    now  = datetime.utcnow().isoformat()
    conn.execute(
        """INSERT INTO watchlists (name, symbols, created_at, updated_at)
           VALUES (?,?,?,?)
           ON CONFLICT(name) DO UPDATE SET symbols=excluded.symbols, updated_at=excluded.updated_at""",
        (body.name, json.dumps(body.symbols), now, now)
    )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/watchlists/{name}")
def delete_watchlist(name: str):
    conn = get_db()
    conn.execute("DELETE FROM watchlists WHERE name=?", (name,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ── Pre-market gap scanner ────────────────────────────────────────────────────

@app.get("/api/premarket")
async def premarket(limit: int = 30):
    result = await asyncio.to_thread(get_premarket_movers, limit)
    return result


# ── Unusual options flow scanner ─────────────────────────────────────────────

@app.get("/api/flow/scan")
async def flow_scan(limit: int = 50):
    result = await asyncio.to_thread(scan_unusual_flow, 2.0, limit)
    return result


# ── Earnings IV analysis ──────────────────────────────────────────────────────

@app.get("/api/earnings/{symbol}/iv")
async def earnings_iv(symbol: str):
    result = await asyncio.to_thread(get_earnings_iv_analysis, symbol.upper())
    return result


# ── Intraday momentum scanner ─────────────────────────────────────────────────

@app.get("/api/intraday/scan")
async def intraday_scan(limit: int = 25):
    result = await asyncio.to_thread(scan_intraday, limit)
    return result


# ── Multi-timeframe analysis ──────────────────────────────────────────────────

@app.get("/api/multi-timeframe/{symbol}")
async def multi_timeframe(symbol: str):
    result = await asyncio.to_thread(get_multi_timeframe, symbol.upper())
    return result


# ── Volatility skew (IV by strike for current expiry) ─────────────────────────

@app.get("/api/options/{symbol}/skew")
async def vol_skew(symbol: str, expiry: str | None = None):
    chain = await asyncio.to_thread(get_options_chain, symbol.upper(), expiry)
    if not chain:
        raise HTTPException(404, "No chain data")
    calls = chain.get("calls", [])
    puts  = chain.get("puts",  [])
    # Build strike → {callIV, putIV}
    skew = {}
    for c in calls:
        s = c.get("strike")
        if s:
            skew.setdefault(s, {})["callIV"] = c.get("impliedVolatility")
    for p in puts:
        s = p.get("strike")
        if s:
            skew.setdefault(s, {})["putIV"] = p.get("impliedVolatility")
    rows = sorted(
        [{"strike": s, "callIV": v.get("callIV"), "putIV": v.get("putIV")} for s, v in skew.items()],
        key=lambda x: x["strike"]
    )
    return {
        "symbol":         symbol.upper(),
        "expiry":         expiry or chain.get("selectedExpiry"),
        "underlyingPrice": chain.get("underlyingPrice"),
        "skew":           rows,
    }


# ── Paper trading (Alpaca) ────────────────────────────────────────────────────

@app.get("/api/trading/account")
async def trading_account():
    result = await asyncio.to_thread(get_account, ALPACA_KEY, ALPACA_SECRET)
    return result


@app.get("/api/trading/positions")
async def trading_positions():
    result = await asyncio.to_thread(get_positions, ALPACA_KEY, ALPACA_SECRET)
    return {"positions": result}


@app.get("/api/trading/orders")
async def trading_orders(status: str = "all"):
    result = await asyncio.to_thread(get_orders, ALPACA_KEY, ALPACA_SECRET, status)
    return {"orders": result}


class OrderBody(BaseModel):
    symbol:     str
    qty:        float
    side:       str
    order_type: str = "market"
    limit_price: float | None = None


@app.post("/api/trading/orders")
async def submit_order(body: OrderBody):
    result = await asyncio.to_thread(
        place_order, ALPACA_KEY, ALPACA_SECRET,
        body.symbol, body.qty, body.side, body.order_type, body.limit_price
    )
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@app.delete("/api/trading/orders/{order_id}")
async def cancel_trading_order(order_id: str):
    result = await asyncio.to_thread(cancel_order, ALPACA_KEY, ALPACA_SECRET, order_id)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@app.delete("/api/trading/positions/{symbol}")
async def close_trading_position(symbol: str):
    result = await asyncio.to_thread(close_position, ALPACA_KEY, ALPACA_SECRET, symbol)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


# ── Trade journal (SQLite) ────────────────────────────────────────────────────

class JournalEntry(BaseModel):
    symbol:      str
    side:        str
    qty:         float
    entry_price: float
    exit_price:  float | None = None
    entry_time:  str
    exit_time:   str | None = None
    notes:       str | None = None
    tags:        str | None = None


@app.get("/api/journal")
def list_journal(limit: int = 100):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM trade_journal ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return {"trades": [dict(r) for r in rows]}


@app.post("/api/journal")
def add_journal_entry(body: JournalEntry):
    conn = get_db()
    now  = datetime.utcnow().isoformat()
    pnl, pnl_pct, status = None, None, "open"
    if body.exit_price is not None:
        direction = 1 if body.side.lower() == "buy" else -1
        pnl       = round((body.exit_price - body.entry_price) * direction * body.qty, 2)
        pnl_pct   = round((body.exit_price - body.entry_price) / body.entry_price * direction * 100, 2)
        status    = "closed"
    cur = conn.execute(
        """INSERT INTO trade_journal
           (symbol,side,qty,entry_price,exit_price,entry_time,exit_time,notes,tags,pnl,pnl_pct,status,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (body.symbol.upper(), body.side, body.qty, body.entry_price, body.exit_price,
         body.entry_time, body.exit_time, body.notes, body.tags, pnl, pnl_pct, status, now)
    )
    conn.commit()
    trade_id = cur.lastrowid
    conn.close()
    return {"id": trade_id, "pnl": pnl, "pnl_pct": pnl_pct, "status": status}


@app.put("/api/journal/{trade_id}/close")
def close_journal_trade(trade_id: int, exit_price: float, exit_time: str | None = None):
    conn = get_db()
    row  = conn.execute("SELECT * FROM trade_journal WHERE id=?", (trade_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Trade not found")
    direction = 1 if row["side"].lower() == "buy" else -1
    pnl     = round((exit_price - row["entry_price"]) * direction * row["qty"], 2)
    pnl_pct = round((exit_price - row["entry_price"]) / row["entry_price"] * direction * 100, 2)
    now     = exit_time or datetime.utcnow().isoformat()
    conn.execute(
        "UPDATE trade_journal SET exit_price=?,exit_time=?,pnl=?,pnl_pct=?,status='closed' WHERE id=?",
        (exit_price, now, pnl, pnl_pct, trade_id)
    )
    conn.commit()
    conn.close()
    return {"id": trade_id, "pnl": pnl, "pnl_pct": pnl_pct}


@app.delete("/api/journal/{trade_id}")
def delete_journal_entry(trade_id: int):
    conn = get_db()
    conn.execute("DELETE FROM trade_journal WHERE id=?", (trade_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ── Economic calendar ─────────────────────────────────────────────────────────

@app.get("/api/calendar")
async def economic_calendar(days_ahead: int = 60):
    result = await asyncio.to_thread(get_calendar, days_ahead)
    return result


# ── Earnings history ──────────────────────────────────────────────────────────

@app.get("/api/stock/{symbol}/earnings-history")
async def earnings_history(symbol: str, quarters: int = 8):
    result = await asyncio.to_thread(get_earnings_history, symbol.upper(), quarters)
    return result


# ── Deep stock info (fundamentals, levels, short interest, expected move) ────

@app.get("/api/stock/{symbol}/deep")
async def stock_deep(symbol: str):
    result = await asyncio.to_thread(get_deep_info, symbol.upper())
    return result


# ── Pre-earnings institutional flow ──────────────────────────────────────────

@app.get("/api/earnings-flow/scan")
async def earnings_flow_scan(days_ahead: int = 21, limit: int = 60):
    """Scan for institutional pre-earnings positioning: call buying surges, Vol/OI spikes, stock volume."""
    result = await asyncio.to_thread(scan_earnings_flow, days_ahead, limit)
    return result


# ── Institutional holders ─────────────────────────────────────────────────────

@app.get("/api/institutions/{symbol}/holders")
def institutional_holders(symbol: str):
    result = get_institutional_holders(symbol.upper())
    return result


@app.get("/api/institutions/{symbol}/major")
def major_holders(symbol: str):
    result = get_major_holders(symbol.upper())
    return result


# ── Institutional flow tracker ────────────────────────────────────────────────

@app.get("/api/institutional-flow")
async def institutional_flow_scan(limit: int = 50):
    """Scan for institutional flow across major symbols."""
    result = await asyncio.to_thread(get_institutional_flow, None, limit)
    return result


@app.get("/api/institutional-flow/{symbol}")
async def institutional_flow_symbol(symbol: str):
    """Get institutional flow data for a specific symbol."""
    result = await asyncio.to_thread(get_institutional_flow, symbol.upper(), 1)
    flows = result.get('flows', [])
    return flows[0] if flows else {"symbol": symbol.upper(), "error": "No unusual activity detected"}


# ── Crypto hub ────────────────────────────────────────────────────────────────

@app.get("/api/crypto/overview")
async def crypto_overview():
    """Global crypto market stats + Fear & Greed index."""
    result = await asyncio.to_thread(get_crypto_overview)
    return result


@app.get("/api/crypto/top")
async def crypto_top(limit: int = 50):
    """Top coins by market cap."""
    result = await asyncio.to_thread(get_top_coins, limit)
    return result


@app.get("/api/crypto/{symbol}/info")
async def crypto_coin_info(symbol: str):
    """Detailed info for a single coin (BTC, ETH, bitcoin, etc.)."""
    result = await asyncio.to_thread(get_coin_info, symbol)
    if not result:
        raise HTTPException(404, f"Coin not found: {symbol}")
    return result


# ── Holdings tracker ──────────────────────────────────────────────────────────

class HoldingBody(BaseModel):
    symbol:         str
    purchased_price: float
    qty:            float = 1.0
    provider:       str = "Manual"
    asset_type:     str = "stock"
    purchased_date: str | None = None
    notes:          str | None = None


class HoldingUpdateBody(BaseModel):
    symbol:         str | None = None
    name:           str | None = None
    asset_type:     str | None = None
    provider:       str | None = None
    purchased_price: float | None = None
    qty:            float | None = None
    purchased_date: str | None = None
    notes:          str | None = None


@app.get("/api/holdings")
async def holdings_list():
    result = await asyncio.to_thread(get_holdings)
    return {"holdings": result}


@app.post("/api/holdings")
async def holdings_add(body: HoldingBody):
    result = await asyncio.to_thread(
        add_holding,
        body.symbol, body.purchased_price, body.qty,
        body.provider, body.asset_type, body.purchased_date, body.notes
    )
    return result


@app.put("/api/holdings/{holding_id}")
async def holdings_update(holding_id: int, body: HoldingUpdateBody):
    kwargs = body.model_dump(exclude_none=True)
    result = await asyncio.to_thread(update_holding, holding_id, **kwargs)
    return result


@app.delete("/api/holdings/{holding_id}")
async def holdings_delete(holding_id: int):
    result = await asyncio.to_thread(delete_holding, holding_id)
    return result


@app.get("/api/holdings/{symbol}/detail")
async def holdings_detail(symbol: str):
    result = await asyncio.to_thread(get_holding_detail, symbol.upper())
    return result


@app.get("/api/holdings/{symbol}/history")
async def holdings_history(symbol: str, days: int = 30):
    result = await asyncio.to_thread(get_price_history, symbol.upper(), days)
    return {"history": result}


@app.post("/api/holdings/refresh")
async def holdings_refresh():
    result = await asyncio.to_thread(refresh_all_prices)
    return result


# ── DB Stats (read-only view of what's stored) ────────────────────────────────

@app.get("/api/db/stats")
def db_stats():
    """Read-only overview of all database tables — row counts and recent entries."""
    conn = get_db()
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()

    result = {}
    for row in tables:
        tbl = row["name"]
        try:
            count = conn.execute(f"SELECT COUNT(*) FROM [{tbl}]").fetchone()[0]
            # Try to get the most recent row (look for common timestamp columns)
            recent = None
            for col in ("fetched_at", "created_at", "recorded_at", "updated_at"):
                try:
                    r = conn.execute(
                        f"SELECT * FROM [{tbl}] ORDER BY [{col}] DESC LIMIT 1"
                    ).fetchone()
                    if r:
                        recent = dict(r)
                        break
                except Exception:
                    continue
            result[tbl] = {"rows": count, "latest": recent}
        except Exception as e:
            result[tbl] = {"rows": "error", "error": str(e)}

    conn.close()
    db_path = str(get_db.__module__)
    import os
    from server.db import DB_PATH
    size_bytes = os.path.getsize(str(DB_PATH)) if os.path.exists(str(DB_PATH)) else 0
    return {
        "tables":   result,
        "db_path":  str(DB_PATH),
        "db_size":  f"{size_bytes / 1024:.1f} KB",
        "table_count": len(tables),
    }
