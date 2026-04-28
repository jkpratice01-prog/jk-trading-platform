"""Multi-timeframe analysis — daily, hourly, 15-min signal alignment."""
import yfinance as yf
import numpy as np
from datetime import datetime


def _rsi(closes, period=14):
    if len(closes) < period + 1:
        return None
    d  = np.diff(closes)
    ag = float(np.mean(np.where(d > 0, d, 0)[:period]))
    al = float(np.mean(np.where(d < 0, -d, 0)[:period]))
    for i in range(period, len(d)):
        ag = (ag*(period-1) + (d[i] if d[i]>0 else 0)) / period
        al = (al*(period-1) + (-d[i] if d[i]<0 else 0)) / period
    return 100.0 if al == 0 else round(100 - 100/(1+ag/al), 1)


def _ema(data, period):
    if len(data) < period:
        return float(data[-1]) if len(data) else 0.0
    k, v = 2.0/(period+1), float(np.mean(data[:period]))
    for x in data[period:]:
        v = float(x)*k + v*(1-k)
    return v


def _analyze(hist):
    if hist is None or hist.empty or len(hist) < 20:
        return None
    closes  = hist['Close'].values.astype(float)
    volumes = hist['Volume'].values.astype(float)
    price   = float(closes[-1])
    rsi     = _rsi(closes)
    ema20   = _ema(closes, 20)
    ema50   = _ema(closes, min(50, len(closes)))
    macd_bull = None
    if len(closes) >= 26:
        ml = _ema(closes, 12) - _ema(closes, 26)
        mh = [_ema(closes[:i+1], 12)-_ema(closes[:i+1], 26) for i in range(25, len(closes))]
        ms = _ema(np.array(mh), 9) if len(mh) >= 9 else None
        macd_bull = ml > ms if ms is not None else None
    trend = 'UPTREND' if price>ema20>ema50 else 'DOWNTREND' if price<ema20<ema50 else 'SIDEWAYS'
    avg_v = float(np.mean(volumes[-21:-1])) if len(volumes)>21 else float(np.mean(volumes[:-1]))
    vol_r = round(float(volumes[-1])/avg_v, 2) if avg_v > 0 else 1.0
    score = 50
    score += 20 if trend=='UPTREND' else (-20 if trend=='DOWNTREND' else 0)
    if rsi: score += 10 if rsi>50 else -10
    if macd_bull is True: score += 10
    elif macd_bull is False: score -= 10
    if vol_r > 1.5: score += 10
    score = max(0, min(100, round(score)))
    return {
        'price': round(price,2), 'rsi': rsi, 'ema20': round(ema20,2), 'ema50': round(ema50,2),
        'trend': trend, 'macdBull': macd_bull,
        'rsiSignal': 'OVERBOUGHT' if (rsi or 50)>70 else 'OVERSOLD' if (rsi or 50)<30 else 'NEUTRAL',
        'volRatio': vol_r, 'score': score,
        'signal': 'BULLISH' if score>=60 else 'BEARISH' if score<=40 else 'NEUTRAL',
    }


def get_multi_timeframe(symbol: str) -> dict:
    sym, t = symbol.upper(), yf.Ticker(symbol.upper())
    tfs = {}
    for key, kwargs in [('daily',{'period':'3mo','interval':'1d'}),
                        ('hourly',{'period':'5d','interval':'1h'}),
                        ('15min', {'period':'5d','interval':'15m'})]:
        try:   tfs[key] = t.history(**kwargs)
        except: tfs[key] = None
    analyzed   = {k: _analyze(v) for k, v in tfs.items()}
    signals    = [a['signal'] for a in analyzed.values() if a]
    bull, bear = sum(1 for s in signals if s=='BULLISH'), sum(1 for s in signals if s=='BEARISH')
    total      = len(signals)
    if   total==0:              align = 'NO_DATA'
    elif bull==total:           align = 'FULL_BULL'
    elif bear==total:           align = 'FULL_BEAR'
    elif bull > bear:           align = 'MOSTLY_BULL'
    elif bear > bull:           align = 'MOSTLY_BEAR'
    else:                       align = 'MIXED'
    return {
        'symbol': sym, 'timeframes': analyzed, 'alignment': align,
        'alignmentScore': round(bull/total*100) if total else 50,
        'bullCount': bull, 'bearCount': bear, 'analyzedAt': datetime.utcnow().isoformat(),
    }
