"""Theme Rocket Scanner — finds stocks in hot themes that rocketed 30d+ gains.

Themes: AI, Data Center Build-Out, Memory/Storage, Semiconductors,
        Nuclear/Power, Defense & Security, Quantum Computing, Biotech Catalyst.
"""
import time
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from server.services.yf_session import ticker as yf_ticker

THEME_UNIVERSE = {
    "AI & LLM": [
        'PLTR', 'BBAI', 'SOUN', 'AI', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMD',
        'IONQ', 'RGTI', 'QUBT', 'KULR', 'IREN', 'ARQQ',
    ],
    "Data Center Build-Out": [
        'VRT',  'ETN',  'FIX',  'PWR',  'NVEE', 'MYRG', 'WLDN',
        'EQIX', 'DLR',  'AMT',  'SMCI', 'DELL', 'HPE',
        'ANET', 'JNPR', 'CSCO',
    ],
    "Memory & Storage": [
        'MU', 'SNDK', 'WDC', 'STX', 'NTAP', 'PSTG', 'NAND',
    ],
    "Semiconductors": [
        'NVDA', 'AMD', 'AVGO', 'AMAT', 'LRCX', 'ASML', 'TSM', 'ARM',
        'MRVL', 'ONTO', 'MPWR', 'ACLS', 'KLAC',
    ],
    "Nuclear & Power": [
        'CEG', 'VST', 'NRG', 'CCJ', 'UUUU', 'LEU', 'SMR',
        'OKLO', 'NNE', 'BWXT', 'GEV',
    ],
    "Defense & Security": [
        'LMT', 'RTX', 'NOC', 'GD', 'AXON', 'CRWD', 'PANW', 'OKTA',
        'CACI', 'SAIC', 'LDOS', 'KTOS',
    ],
    "Quantum Computing": [
        'IONQ', 'RGTI', 'QUBT', 'IBM', 'GOOGL', 'MSFT', 'ARQQ',
    ],
    "Biotech Catalyst": [
        'LLY', 'MRNA', 'VRTX', 'RXRX', 'HIMS', 'ROIV', 'VKTX',
        'NVAX', 'IMVT', 'NKTR',
    ],
}

# Remove NAND (not a real ticker, placeholder)
THEME_UNIVERSE["Memory & Storage"] = [s for s in THEME_UNIVERSE["Memory & Storage"] if s != 'NAND']


def _fetch_stock(symbol: str) -> dict | None:
    try:
        t = yf_ticker(symbol)
        fi = t.fast_info

        price     = fi.last_price
        avg_vol   = fi.three_month_average_volume or 0
        today_vol = fi.last_volume or 0
        mkt_cap   = fi.market_cap or 0

        if not price or price < 1 or avg_vol < 20_000:
            return None

        # 35-day history to get a clean 30d start point
        hist = t.history(period='35d', interval='1d', auto_adjust=True)
        if hist is None or len(hist) < 20:
            return None

        price_30d_ago = float(hist['Close'].iloc[0])
        if price_30d_ago <= 0:
            return None

        gain_30d = (price - price_30d_ago) / price_30d_ago * 100
        vol_ratio = today_vol / avg_vol if avg_vol > 0 else 1.0

        try:
            info      = t.info or {}
            short_name = info.get('shortName') or symbol
            sector     = info.get('sector', '')
            industry   = info.get('industry', '')
        except Exception:
            short_name = symbol
            sector = industry = ''

        return {
            'symbol':    symbol,
            'shortName': short_name,
            'sector':    sector,
            'industry':  industry,
            'price':     round(price, 2),
            'gain30d':   round(gain_30d, 1),
            'volRatio':  round(vol_ratio, 2),
            'todayVol':  int(today_vol),
            'marketCap': int(mkt_cap),
        }
    except Exception:
        return None


def scan_theme_rockets(min_gain: float = 20.0) -> dict:
    """Scan all theme stocks for 30d gains above min_gain%."""
    # Deduplicate across themes but keep per-theme membership
    all_symbols = {}
    for theme, syms in THEME_UNIVERSE.items():
        for s in syms:
            all_symbols.setdefault(s, []).append(theme)

    results_by_symbol: dict[str, dict] = {}

    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(_fetch_stock, sym): sym for sym in all_symbols}
        for fut in as_completed(futures, timeout=60):
            sym = futures[fut]
            try:
                r = fut.result()
                if r:
                    results_by_symbol[sym] = r
            except Exception:
                pass

    # Attach themes and filter
    themed: list[dict] = []
    for sym, row in results_by_symbol.items():
        row['themes'] = all_symbols[sym]
        row['primaryTheme'] = all_symbols[sym][0]
        if row['gain30d'] >= min_gain:
            themed.append(row)

    themed.sort(key=lambda x: x['gain30d'], reverse=True)

    # Group by primaryTheme for display
    by_theme: dict[str, list] = {}
    for row in themed:
        for theme in row['themes']:
            by_theme.setdefault(theme, []).append(row)

    # Sort each theme group by gain desc
    for theme in by_theme:
        by_theme[theme].sort(key=lambda x: x['gain30d'], reverse=True)

    return {
        'rockets': themed,
        'byTheme': by_theme,
        'total':   len(themed),
        'themes':  list(THEME_UNIVERSE.keys()),
        'minGain': min_gain,
        'scannedAt': pd.Timestamp.now().isoformat(),
    }