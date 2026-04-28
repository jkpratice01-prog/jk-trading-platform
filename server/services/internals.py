"""Market internals — VIX structure, index breadth, fear gauge."""
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

SYMBOLS = ['^VIX', '^VIX3M', '^VVIX', '^SKEW', 'SPY', 'QQQ', 'IWM', 'TLT', 'GLD', 'UUP']


def _fetch(sym: str) -> tuple:
    try:
        t    = yf.Ticker(sym)
        hist = t.history(period='5d', interval='1d')
        if hist.empty:
            return sym, None
        price = float(hist['Close'].iloc[-1])
        prev  = float(hist['Close'].iloc[-2]) if len(hist) >= 2 else price
        chg   = round((price - prev) / prev * 100, 2) if prev else 0
        return sym, {'price': round(price, 2), 'prev': round(prev, 2), 'change': chg}
    except Exception:
        return sym, None


def get_internals() -> dict:
    raw = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(_fetch, s): s for s in SYMBOLS}
        for fut in as_completed(futs, timeout=25):
            sym, data = fut.result()
            if data:
                raw[sym] = data

    vix    = raw.get('^VIX',  {})
    vix3m  = raw.get('^VIX3M', {})
    vvix   = raw.get('^VVIX', {})
    skew   = raw.get('^SKEW', {})
    spy    = raw.get('SPY',   {})
    qqq    = raw.get('QQQ',   {})
    iwm    = raw.get('IWM',   {})
    tlt    = raw.get('TLT',   {})
    gld    = raw.get('GLD',   {})

    vix_level   = vix.get('price', 0)
    vix3m_level = vix3m.get('price', 0)

    # VIX term structure: VIX3M − VIX
    # Positive = contango (calm), Negative = backwardation (fear)
    term_spread = round(vix3m_level - vix_level, 2) if vix_level and vix3m_level else None
    if term_spread is None:       term_signal = None
    elif term_spread > 2:         term_signal = 'contango'
    elif term_spread > 0:         term_signal = 'flat'
    elif term_spread > -2:        term_signal = 'flattening'
    else:                         term_signal = 'backwardation'

    # Fear label
    if   vix_level >= 35: fear = 'Extreme Fear'
    elif vix_level >= 25: fear = 'Fear'
    elif vix_level >= 18: fear = 'Elevated'
    elif vix_level >= 12: fear = 'Calm'
    else:                 fear = 'Complacency'

    spy_chg = spy.get('change', 0)
    qqq_chg = qqq.get('change', 0)
    iwm_chg = iwm.get('change', 0)
    tlt_chg = tlt.get('change', 0)
    risk_on = spy_chg > 0 and qqq_chg > 0

    return {
        'vix':          vix,
        'vix3m':        vix3m,
        'vvix':         vvix,
        'skew':         skew,
        'spy':          spy,
        'qqq':          qqq,
        'iwm':          iwm,
        'tlt':          tlt,
        'gld':          gld,
        'termSpread':   term_spread,
        'termSignal':   term_signal,
        'fearLabel':    fear,
        'vixLevel':     vix_level,
        'breadth': {
            'riskOn':        risk_on,
            'riskConfirmed': risk_on and tlt_chg < 0,
            'techVsSmallCap': round(qqq_chg - iwm_chg, 2),
            'spyChange': spy_chg, 'qqqChange': qqq_chg, 'iwmChange': iwm_chg, 'tltChange': tlt_chg,
        },
        'fetchedAt': datetime.utcnow().isoformat(),
    }
