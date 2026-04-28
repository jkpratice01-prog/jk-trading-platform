"""Market scanner — ported from Trade_MVP with Alpaca + yfinance data."""
import math
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from typing import Optional
import numpy as np
import pandas as pd
import yfinance as yf
from server.db import get_db

try:
    from alpaca.data import StockHistoricalDataClient
    from alpaca.data.requests import StockBarsRequest
    from alpaca.data.timeframe import TimeFrame
    _ALPACA_OK = True
except ImportError:
    _ALPACA_OK = False

SCAN_TTL = 300  # 5 minutes


# ── Technical indicators ───────────────────────────────────────────────────────

def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()

def _sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n).mean()

def _rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    gain = d.where(d > 0, 0).rolling(n).mean()
    loss = (-d.where(d < 0, 0)).rolling(n).mean()
    return 100 - (100 / (1 + gain / loss.replace(0, np.nan)))

def _macd(s: pd.Series):
    fast  = _ema(s, 12)
    slow  = _ema(s, 26)
    line  = fast - slow
    sig   = _ema(line, 9)
    return line, sig

def _atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    tr = pd.concat([high - low,
                    (high - close.shift()).abs(),
                    (low  - close.shift()).abs()], axis=1).max(axis=1)
    return tr.rolling(n).mean()

def _add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ema_21"]  = _ema(df["close"], 21)
    df["ema_50"]  = _ema(df["close"], 50)
    df["sma_50"]  = _sma(df["close"], 50)
    df["sma_200"] = _sma(df["close"], 200)
    df["rsi"]     = _rsi(df["close"], 14)
    df["rsi_change"] = df["rsi"].diff()
    df["macd"], df["macd_signal"] = _macd(df["close"])
    df["atr"]       = _atr(df["high"], df["low"], df["close"], 14)
    df["atr_pct"]   = df["atr"] / df["close"] * 100
    df["vol_sma"]   = df["volume"].rolling(20).mean()
    df["vol_ratio"] = df["volume"] / df["vol_sma"]
    df["high_20"]   = df["high"].rolling(20).max()
    bb_mid  = _sma(df["close"], 20)
    bb_std  = df["close"].rolling(20).std()
    df["bb_upper"] = bb_mid + 2 * bb_std
    df["bb_lower"] = bb_mid - 2 * bb_std
    return df


# ── Data fetching ──────────────────────────────────────────────────────────────

def _fetch_bars_alpaca(symbol: str, api_key: str, secret: str, days: int = 90) -> pd.DataFrame:
    if not _ALPACA_OK or not api_key or symbol.startswith("^"):
        return pd.DataFrame()
    try:
        client = StockHistoricalDataClient(api_key=api_key, secret_key=secret)
        start  = datetime.utcnow() - timedelta(days=days + 10)
        bars   = client.get_stock_bars(StockBarsRequest(
            symbol_or_symbols=symbol, timeframe=TimeFrame.Day, start=start
        ))
        df = bars.df
        if df.empty:
            return pd.DataFrame()
        if "symbol" in df.index.names:
            df = df.xs(symbol, level="symbol")
        df = df.reset_index()
        df.columns = [c.lower() for c in df.columns]
        df = df.rename(columns={"timestamp": "date", "t": "date"})
        return df[["date", "open", "high", "low", "close", "volume"]].dropna()
    except Exception as e:
        print(f"[scanner/alpaca] {symbol}: {e}")
        return pd.DataFrame()


def _fetch_bars_yf(symbol: str, days: int = 90) -> pd.DataFrame:
    try:
        # Use Ticker.history() — avoids yfinance MultiIndex column issues with yf.download()
        hist = yf.Ticker(symbol).history(period=f"{days}d", interval="1d")
        if hist.empty:
            return pd.DataFrame()
        hist = hist.reset_index()
        hist.columns = [c.lower() for c in hist.columns]
        # yfinance history() uses 'date' or 'datetime' depending on interval
        if 'datetime' in hist.columns:
            hist = hist.rename(columns={'datetime': 'date'})
        # Drop timezone from date if present
        if hasattr(hist['date'].dtype, 'tz') and hist['date'].dtype.tz:
            hist['date'] = hist['date'].dt.tz_localize(None)
        return hist[["date", "open", "high", "low", "close", "volume"]].dropna()
    except Exception as e:
        print(f"[scanner/yf] {symbol}: {e}")
        return pd.DataFrame()


def _get_bars(symbol: str, alpaca_key: str, alpaca_secret: str) -> pd.DataFrame:
    df = _fetch_bars_alpaca(symbol, alpaca_key, alpaca_secret)
    if df.empty:
        df = _fetch_bars_yf(symbol)
    return df


# ── Scoring ────────────────────────────────────────────────────────────────────

WEIGHTS = {
    "trend": 15, "rsi": 15, "macd": 10, "volume": 15,
    "breakout": 10, "golden_cross": 5, "pullback": 25, "price_action": 20,
    "chasing_penalty": -20,
}


def _score(df: pd.DataFrame, symbol: str) -> tuple[float, list[str], dict]:
    if len(df) < 50:
        return 0, ["Insufficient data"], {}

    df    = _add_indicators(df)
    last  = df.iloc[-1]
    prev  = df.iloc[-2]
    score = 0
    notes = []
    cond  = {}
    w     = WEIGHTS

    # Quality filter
    price    = last["close"]
    avg_vol  = df["volume"].tail(20).mean()
    atr_pct  = last.get("atr_pct", 0)
    if price < 5:
        return 0, [f"Penny stock ${price:.2f}"], cond
    if avg_vol < 500_000:
        return 0, [f"Low liquidity {avg_vol/1e6:.1f}M avg vol"], cond
    if atr_pct > 8:
        return 0, [f"Too volatile {atr_pct:.1f}% ATR"], cond

    # Sideways check
    bb_width = (last.get("bb_upper", price) - last.get("bb_lower", price)) / price * 100
    ema_gap  = abs(last.get("ema_21", price) - last.get("ema_50", price)) / price * 100
    if atr_pct < 1.5 and bb_width < 4 and ema_gap < 1:
        return 0, ["Sideways market — skip"], cond

    # 1. Trend
    ema21, ema50 = last.get("ema_21", price), last.get("ema_50", price)
    trend_ok = pd.notna(ema21) and pd.notna(ema50) and price > ema21 > ema50
    cond["trend"] = trend_ok
    if trend_ok:
        score += w["trend"]
        notes.append(f"✅ Uptrend: ${price:.2f} > EMA21 ${ema21:.2f} > EMA50 ${ema50:.2f}")
    else:
        notes.append(f"❌ No uptrend")

    # 2. RSI
    rsi, rsi_prev = last.get("rsi"), prev.get("rsi")
    rsi_ok = pd.notna(rsi) and pd.notna(rsi_prev) and 40 <= rsi <= 70 and rsi > rsi_prev
    cond["rsi"] = rsi_ok
    if rsi_ok:
        score += w["rsi"]
        notes.append(f"✅ RSI {rsi:.1f} in range & rising")
    else:
        notes.append(f"RSI {rsi:.1f}" if pd.notna(rsi) else "RSI —")

    # 3. MACD
    macd, sig = last.get("macd"), last.get("macd_signal")
    pm, ps    = prev.get("macd"), prev.get("macd_signal")
    macd_ok = (pd.notna(macd) and pd.notna(sig) and
               ((pd.notna(pm) and pm <= ps and macd > sig) or (macd > sig and macd > 0)))
    cond["macd"] = macd_ok
    if macd_ok:
        score += w["macd"]
        notes.append(f"✅ MACD bullish")
    else:
        notes.append(f"MACD bearish/neutral")

    # 4. Volume
    vol_ratio = last.get("vol_ratio", 1)
    vol_ok = pd.notna(vol_ratio) and vol_ratio >= 1.2
    cond["volume"] = vol_ok
    if vol_ok:
        score += w["volume"]
        notes.append(f"✅ Volume {vol_ratio:.1f}x avg")
    else:
        notes.append(f"Volume {vol_ratio:.1f}x avg")

    # 5. Breakout
    high20 = df["high"].iloc[-21:-1].max() if len(df) > 21 else None
    break_ok = high20 is not None and price >= high20 * 0.98
    cond["breakout"] = break_ok
    if break_ok:
        score += w["breakout"]
        notes.append(f"✅ Near/at 20-day high")
    else:
        notes.append(f"Below 20-day high")

    # 6. Golden cross
    sma50, sma200 = last.get("sma_50"), last.get("sma_200")
    gc_ok = pd.notna(sma50) and pd.notna(sma200) and sma50 > sma200
    cond["golden_cross"] = gc_ok
    if gc_ok:
        score += w["golden_cross"]
        notes.append("✅ Golden cross")

    # 7. Pullback entry
    dist_ema21 = ((price - ema21) / ema21 * 100) if pd.notna(ema21) and ema21 else 0
    dist_ema50 = ((price - ema50) / ema50 * 100) if pd.notna(ema50) and ema50 else 0
    in_uptrend = pd.notna(ema21) and pd.notna(ema50) and ema21 > ema50
    pullback_ok = in_uptrend and (abs(dist_ema21) <= 2 or abs(dist_ema50) <= 2)
    chasing     = dist_ema21 > 5
    cond["pullback"] = pullback_ok
    if pullback_ok:
        score += w["pullback"]
        notes.append(f"✅ Pullback entry ({dist_ema21:+.1f}% from EMA21)")
    elif chasing:
        score += w["chasing_penalty"]
        notes.append(f"⚠️ Chasing: {dist_ema21:.1f}% above EMA21")

    # 8. Price action patterns
    c2, c1 = df.iloc[-3], df.iloc[-2]
    pa_score = 0
    body = last["close"] - last["open"]
    prev_body = c1["close"] - c1["open"]
    if prev_body < 0 and body > 0 and last["open"] <= c1["close"] and last["close"] >= c1["open"]:
        pa_score += 30  # Bullish engulfing
    lower_wick = min(last["open"], last["close"]) - last["low"]
    if lower_wick > abs(body) * 2:
        pa_score += 25  # Hammer
    if c1["low"] > c2["low"] and last["low"] > c1["low"]:
        pa_score += 20  # Higher lows
    if pa_score >= 25:
        score += min(pa_score // 2, w["price_action"])
        notes.append(f"✅ Bullish price pattern (+{min(pa_score//2, w['price_action'])})")

    # Signal
    conds_met = sum([trend_ok, rsi_ok, macd_ok, vol_ok, break_ok])
    if conds_met == 5:
        signal = "STRONG_BUY"
    elif conds_met >= 4 or score >= 60:
        signal = "BUY"
    elif conds_met <= 1 or score < 0:
        signal = "SELL"
    else:
        signal = "NEUTRAL"

    notes.insert(0, f"Score: {score:.0f} | Conditions: {conds_met}/5 | Signal: {signal}")

    # Stops
    atr = last.get("atr", price * 0.02)
    swing_low = df["low"].tail(20).min()
    stop  = round(max(swing_low - atr * 0.5, price - atr * 3), 2)
    risk  = price - stop
    tgt   = round(price + risk * 2, 2)

    prev_close = float(df.iloc[-2]["close"])
    change_pct = round((price - prev_close) / prev_close * 100, 2) if prev_close else 0
    volume     = int(last.get("volume", 0))

    return score, notes, {
        **cond,
        "signal":       signal,
        "price":        round(price, 2),
        "change_pct":   change_pct,
        "volume":       volume,
        "rsi":          round(float(rsi), 1) if pd.notna(rsi) else None,
        "volume_ratio": round(float(vol_ratio), 2) if pd.notna(vol_ratio) else None,
        "macd_signal":  "BULLISH" if macd_ok else "BEARISH",
        "trend":        "UPTREND" if trend_ok else "DOWNTREND" if (pd.notna(ema21) and price < ema21) else "SIDEWAYS",
        "stop_loss":    stop,
        "take_profit":  tgt,
    }


# ── Cache ──────────────────────────────────────────────────────────────────────

def _read_scan_cache(conn) -> list | None:
    cut = (datetime.utcnow() - timedelta(seconds=SCAN_TTL)).isoformat()
    rows = conn.execute(
        "SELECT * FROM scan_results WHERE fetched_at>? ORDER BY score DESC", (cut,)
    ).fetchall()
    return [dict(r) for r in rows] if rows else None


def _save_scan(results: list[dict], conn):
    now = datetime.utcnow().isoformat()
    conn.execute("DELETE FROM scan_results WHERE fetched_at < ?",
                 ((datetime.utcnow() - timedelta(hours=1)).isoformat(),))
    for r in results:
        conn.execute(
            """INSERT INTO scan_results
               (symbol,score,signal,price,rsi,macd_signal,trend,volume_ratio,
                stop_loss,take_profit,reasons,fetched_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (r["symbol"], r["score"], r["signal"], r["price"],
             r.get("rsi"), r.get("macd_signal"), r.get("trend"),
             r.get("volume_ratio"), r.get("stop_loss"), r.get("take_profit"),
             "\n".join(r.get("reasons", [])), now)
        )
    conn.commit()


# ── Public API ─────────────────────────────────────────────────────────────────

def scan_symbols(symbols: list[str], alpaca_key: str = "", alpaca_secret: str = "",
                 min_score: float = 0) -> list[dict]:
    conn = get_db()
    try:
        results = []
        for sym in symbols:
            sym = sym.upper()
            try:
                df = _get_bars(sym, alpaca_key, alpaca_secret)
                if df.empty or len(df) < 50:
                    continue
                score, reasons, cond = _score(df, sym)
                if score < min_score:
                    continue
                results.append({
                    "symbol":       sym,
                    "score":        round(score, 1),
                    "signal":       cond.get("signal", "NEUTRAL"),
                    "price":        cond.get("price"),
                    "change_pct":   cond.get("change_pct"),
                    "volume":       cond.get("volume"),
                    "rsi":          cond.get("rsi"),
                    "macd_signal":  cond.get("macd_signal"),
                    "trend":        cond.get("trend"),
                    "volume_ratio": cond.get("volume_ratio"),
                    "stop_loss":    cond.get("stop_loss"),
                    "take_profit":  cond.get("take_profit"),
                    "reasons":      reasons,
                })
            except Exception as e:
                print(f"[scanner] {sym}: {e}")

        results.sort(key=lambda r: r["score"], reverse=True)
        if results:
            _save_scan(results, conn)
        return results
    finally:
        conn.close()


def get_cached_scan(min_score: float = 0) -> list[dict]:
    conn = get_db()
    try:
        cached = _read_scan_cache(conn)
        if not cached:
            return []
        return [
            {**r, "reasons": r.get("reasons", "").split("\n")}
            for r in cached if (r.get("score") or 0) >= min_score
        ]
    finally:
        conn.close()
