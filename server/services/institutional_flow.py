"""Institutional flow detection via volume + price analysis (yfinance)."""
from datetime import datetime
from server.services.yf_session import ticker as yf_ticker
from concurrent.futures import ThreadPoolExecutor, as_completed

SCAN_SYMBOLS = [
    # Mega-cap tech
    'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'INTC', 'QCOM',
    'AVGO', 'ORCL', 'CRM', 'ADBE', 'NOW', 'SNOW', 'PLTR', 'COIN',
    # Finance
    'JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'AXP', 'BLK', 'SCHW', 'C',
    # Energy
    'XOM', 'CVX', 'COP', 'OXY', 'SLB',
    # Healthcare
    'UNH', 'LLY', 'PFE', 'JNJ', 'ABBV', 'MRNA', 'AMGN', 'GILD',
    # Consumer / Retail
    'WMT', 'COST', 'TGT', 'HD', 'AMZN', 'NKE', 'SBUX',
    # ETFs
    'SPY', 'QQQ', 'IWM', 'GLD', 'TLT',
    # Semis / Optical Networking
    'MU', 'AMAT', 'LRCX', 'KLAC', 'AAOI', 'COHR', 'LITE', 'CIEN', 'INFN', 'VIAVI', 'IPGP',
    # Clean Energy & Hydrogen
    'FCEL', 'PLUG', 'BE', 'BLDP', 'CLNE', 'HTOO',
    # Growth / speculative
    'SOFI', 'HOOD', 'RBLX', 'U', 'RIVN', 'LCID',
]
# Deduplicate while preserving order
seen = set()
SCAN_SYMBOLS = [s for s in SCAN_SYMBOLS if not (s in seen or seen.add(s))]


def _analyze_symbol(symbol: str) -> dict | None:
    try:
        ticker = yf_ticker(symbol)
        hist = ticker.history(period='10d', interval='1d')
        if hist.empty or len(hist) < 3:
            return None

        today_vol = int(hist['Volume'].iloc[-1])
        avg_vol = float(hist['Volume'].iloc[:-1].mean())
        if avg_vol < 100_000 or today_vol == 0:
            return None

        vol_ratio = today_vol / avg_vol
        if vol_ratio < 1.4:
            return None  # No notable volume spike

        today_close = float(hist['Close'].iloc[-1])
        prev_close = float(hist['Close'].iloc[-2])
        price_change = (today_close - prev_close) / prev_close * 100

        if price_change > 0.3:
            flow_type = 'INSTITUTIONAL_BUYING'
        elif price_change < -0.3:
            flow_type = 'INSTITUTIONAL_SELLING'
        else:
            flow_type = 'HIGH_VOLUME_NEUTRAL'

        # Confidence: driven by volume ratio magnitude + price conviction
        base = min(40, int((vol_ratio - 1.4) * 25))
        price_boost = min(40, int(abs(price_change) * 6))
        confidence = max(30, min(95, 30 + base + price_boost))

        # Try to get top institutional holder name
        top_holder = None
        try:
            holders = ticker.institutional_holders
            if holders is not None and not holders.empty and 'Holder' in holders.columns:
                top_holder = str(holders.iloc[0]['Holder'])
        except Exception:
            pass

        return {
            'symbol': symbol,
            'flowType': flow_type,
            'confidence': confidence,
            'volume': today_vol,
            'avgVolume': int(avg_vol),
            'volumeRatio': round(vol_ratio, 2),
            'price': round(today_close, 2),
            'priceChange': round(price_change, 2),
            'topHolder': top_holder,
            'scannedAt': datetime.utcnow().isoformat(),
        }
    except Exception:
        return None


def get_institutional_flow(symbol: str | None = None, limit: int = 50) -> dict:
    symbols = [symbol.upper()] if symbol else SCAN_SYMBOLS[:limit]

    flows = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(_analyze_symbol, s): s for s in symbols}
        for fut in as_completed(futures, timeout=45):
            result = fut.result()
            if result:
                flows.append(result)

    flows.sort(key=lambda x: x['confidence'], reverse=True)

    summary: dict = {}
    for f in flows:
        summary.setdefault(f['flowType'], []).append(f['symbol'])

    return {
        'flows': flows,
        'summary': summary,
        'scannedAt': datetime.utcnow().isoformat(),
    }


def get_dark_pool_activity(symbol: str | None = None) -> dict:
    return {'available': False, 'message': 'Dark pool data requires a paid data feed (e.g. Unusual Whales, FINRA)'}


def get_block_trades(symbol: str | None = None, min_value: int = 100_000) -> dict:
    return {'available': False, 'message': 'Block trade data requires a paid data feed (e.g. Bloomberg, Refinitiv)'}