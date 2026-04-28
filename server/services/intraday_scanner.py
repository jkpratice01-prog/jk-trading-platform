"""Intraday momentum scanner — 5-min RSI, VWAP, volume surge."""
import yfinance as yf
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

SCAN_UNIVERSE = [
    'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','PLTR','COIN',
    'JPM','GS','BAC','SPY','QQQ','IWM',
    'CRWD','NET','SNOW','DDOG','MSTR','HOOD','SOFI','AFRM',
    'XOM','CVX','OXY','LLY','MRNA','NFLX',
]


def _rsi(closes: np.ndarray, period: int = 14):
    if len(closes) < period + 1:
        return None
    deltas = np.diff(closes)
    gains  = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    ag = float(np.mean(gains[:period]))
    al = float(np.mean(losses[:period]))
    for i in range(period, len(deltas)):
        ag = (ag * (period - 1) + gains[i])  / period
        al = (al * (period - 1) + losses[i]) / period
    if al == 0:
        return 100.0
    return round(100 - 100 / (1 + ag / al), 1)


def _ema(data: np.ndarray, period: int) -> float:
    if len(data) < period:
        return float(data[-1]) if len(data) else 0.0
    k   = 2.0 / (period + 1)
    val = float(np.mean(data[:period]))
    for x in data[period:]:
        val = float(x) * k + val * (1 - k)
    return val


def _scan_symbol(sym: str):
    try:
        t    = yf.Ticker(sym)
        hist = t.history(period='5d', interval='5m')
        if hist.empty or len(hist) < 20:
            return None
        closes  = hist['Close'].values.astype(float)
        highs   = hist['High'].values.astype(float)
        lows    = hist['Low'].values.astype(float)
        volumes = hist['Volume'].values.astype(float)
        price   = closes[-1]
        rsi     = _rsi(closes)
        # VWAP
        typical = (highs + lows + closes) / 3.0
        cum_pv  = np.cumsum(typical * volumes)
        cum_vol = np.cumsum(volumes)
        vwap    = float(np.where(cum_vol > 0, cum_pv / cum_vol, closes)[-1])
        above_vwap = bool(price > vwap)
        # Volume surge
        avg_vol   = float(np.mean(volumes[-21:-1])) if len(volumes) > 21 else float(np.mean(volumes[:-1]))
        vol_ratio = round(float(volumes[-1]) / avg_vol, 2) if avg_vol > 0 else 0.0
        # 5-bar momentum
        mom_pct = round((price - closes[-6]) / closes[-6] * 100, 2) if len(closes) >= 6 else 0.0
        ema9    = _ema(closes, 9)
        ema21   = _ema(closes, 21)
        # Score
        score = 50
        if rsi is not None:
            score += 10 if rsi > 55 else (-10 if rsi < 45 else 0)
        score += 15 if above_vwap else -10
        score += 15 if vol_ratio >= 2.0 else (7 if vol_ratio >= 1.5 else 0)
        score += 10 if ema9 > ema21 else -5
        score += 10 if mom_pct > 0.3 else (-10 if mom_pct < -0.3 else 0)
        score = max(0, min(100, round(score)))
        return {
            'symbol': sym, 'price': round(float(price), 2), 'rsi': rsi,
            'vwap': round(vwap, 2), 'aboveVwap': above_vwap,
            'volRatio': vol_ratio, 'mom5bar': mom_pct,
            'ema9': round(ema9, 2), 'ema21': round(ema21, 2),
            'score': score,
            'signal': 'BULLISH' if score >= 65 else 'BEARISH' if score <= 35 else 'NEUTRAL',
        }
    except Exception:
        return None


def scan_intraday(limit: int = 25) -> dict:
    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(_scan_symbol, s): s for s in SCAN_UNIVERSE}
        for fut in as_completed(futs, timeout=50):
            r = fut.result()
            if r:
                results.append(r)
    results.sort(key=lambda x: x['score'], reverse=True)
    return {'results': results[:limit], 'scannedAt': datetime.utcnow().isoformat(), 'total': len(results)}
