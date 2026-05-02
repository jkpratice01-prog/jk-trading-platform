"""
Crypto market data service.
Uses CoinGecko free API (no key) + alternative.me Fear & Greed index.
All responses are cached in-memory to stay within rate limits.
"""
import time
import requests

# ── In-memory cache ──────────────────────────────────────────────────────────
_cache: dict = {}

def _get(key):
    entry = _cache.get(key)
    if entry and time.time() < entry['expires']:
        return entry['data']
    return None

def _set(key, data, ttl):
    _cache[key] = {'data': data, 'expires': time.time() + ttl}

# ── Common symbol → CoinGecko ID map ─────────────────────────────────────────
_SYMBOL_TO_ID = {
    'BTC':   'bitcoin',
    'ETH':   'ethereum',
    'SOL':   'solana',
    'BNB':   'binancecoin',
    'XRP':   'ripple',
    'DOGE':  'dogecoin',
    'ADA':   'cardano',
    'AVAX':  'avalanche-2',
    'DOT':   'polkadot',
    'LINK':  'chainlink',
    'MATIC': 'matic-network',
    'LTC':   'litecoin',
    'UNI':   'uniswap',
    'ATOM':  'cosmos',
    'SHIB':  'shiba-inu',
    'TON':   'the-open-network',
    'BCH':   'bitcoin-cash',
    'ETC':   'ethereum-classic',
    'NEAR':  'near',
    'ARB':   'arbitrum',
    'OP':    'optimism',
    'SUI':   'sui',
    'APT':   'aptos',
}

_BASE = 'https://api.coingecko.com/api/v3'
_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 TradingPlatform/1.0',
}
_TIMEOUT = 12


def _cg_get(path, params=None):
    """Make a CoinGecko GET request; returns parsed JSON or raises."""
    r = requests.get(f'{_BASE}{path}', params=params, headers=_HEADERS, timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()


def _safe(v):
    """Return None for inf/nan-like values."""
    if v is None:
        return None
    try:
        f = float(v)
        if f != f or abs(f) == float('inf'):
            return None
        return v
    except (TypeError, ValueError):
        return v


# ── Fear & Greed ──────────────────────────────────────────────────────────────

def _get_fear_greed() -> dict:
    try:
        r = requests.get(
            'https://api.alternative.me/fng/?limit=1',
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        item = r.json()['data'][0]
        return {'value': int(item['value']), 'label': item['value_classification']}
    except Exception:
        return {'value': None, 'label': 'N/A'}


# ── Public API ────────────────────────────────────────────────────────────────

def get_crypto_overview() -> dict:
    """Global market stats + Fear & Greed index."""
    cached = _get('overview')
    if cached:
        return cached

    result = {
        'totalMarketCap': None,
        'totalVolume24h': None,
        'btcDominance': None,
        'ethDominance': None,
        'marketCapChange24h': None,
        'activeCryptos': None,
        'fearGreed': {'value': None, 'label': 'N/A'},
    }

    try:
        data = _cg_get('/global')
        gd = data.get('data', {})
        mcaps = gd.get('total_market_cap', {})
        vols  = gd.get('total_volume', {})
        dom   = gd.get('market_cap_percentage', {})
        result.update({
            'totalMarketCap':    _safe(mcaps.get('usd')),
            'totalVolume24h':    _safe(vols.get('usd')),
            'btcDominance':      _safe(dom.get('btc')),
            'ethDominance':      _safe(dom.get('eth')),
            'marketCapChange24h': _safe(gd.get('market_cap_change_percentage_24h_usd')),
            'activeCryptos':     gd.get('active_cryptocurrencies'),
        })
    except Exception as e:
        print(f'[crypto] overview error: {e}')

    result['fearGreed'] = _get_fear_greed()
    _set('overview', result, 60)
    return result


def get_top_coins(limit: int = 50) -> list:
    """Top coins by market cap."""
    cache_key = f'top_{limit}'
    cached = _get(cache_key)
    if cached:
        return cached

    try:
        data = _cg_get('/coins/markets', params={
            'vs_currency': 'usd',
            'order': 'market_cap_desc',
            'per_page': min(limit, 250),
            'page': 1,
            'sparkline': 'false',
            'price_change_percentage': '1h,24h,7d',
        })
    except Exception as e:
        print(f'[crypto] top_coins error: {e}')
        return []

    coins = []
    for c in data:
        sym = (c.get('symbol') or '').upper()
        cg_id = c.get('id', '')
        price = _safe(c.get('current_price'))
        mc    = _safe(c.get('market_cap'))
        ath   = _safe(c.get('ath'))
        ath_change = _safe(c.get('ath_change_percentage'))
        coins.append({
            'id':         cg_id,
            'symbol':     sym,
            'name':       c.get('name', ''),
            'image':      c.get('image', ''),
            'rank':       c.get('market_cap_rank'),
            'price':      price,
            'marketCap':  mc,
            'volume24h':  _safe(c.get('total_volume')),
            'change1h':   _safe(c.get('price_change_percentage_1h_in_currency')),
            'change24h':  _safe(c.get('price_change_percentage_24h_in_currency')),
            'change7d':   _safe(c.get('price_change_percentage_7d_in_currency')),
            'ath':        ath,
            'athChange':  ath_change,
            'yfTicker':   f'{sym}-USD',
        })

    _set(cache_key, coins, 60)
    return coins


def get_coin_info(symbol: str) -> dict | None:
    """Detailed single-coin info. Accepts BTC, BTC-USD, or coingecko IDs."""
    # Normalise input
    clean = symbol.upper().replace('-USD', '').replace('-USDT', '').strip()
    cg_id = _SYMBOL_TO_ID.get(clean, clean.lower())

    cache_key = f'coin_{cg_id}'
    cached = _get(cache_key)
    if cached:
        return cached

    try:
        data = _cg_get(f'/coins/{cg_id}', params={
            'localization': 'false',
            'tickers': 'false',
            'market_data': 'true',
            'community_data': 'false',
            'developer_data': 'false',
        })
    except Exception as e:
        print(f'[crypto] coin_info({cg_id}) error: {e}')
        # Try search fallback if the id wasn't found
        try:
            search = _cg_get('/search', params={'query': clean})
            coins  = search.get('coins', [])
            if coins:
                cg_id = coins[0]['id']
                data  = _cg_get(f'/coins/{cg_id}', params={
                    'localization': 'false',
                    'tickers': 'false',
                    'market_data': 'true',
                    'community_data': 'false',
                    'developer_data': 'false',
                })
            else:
                return None
        except Exception as e2:
            print(f'[crypto] coin_info fallback error: {e2}')
            return None

    try:
        md   = data.get('market_data', {})
        sym  = (data.get('symbol') or '').upper()
        name = data.get('name', '')

        def usd(field):
            v = md.get(field, {})
            return _safe(v.get('usd') if isinstance(v, dict) else v)

        def pct(field):
            v = md.get(field, {})
            if isinstance(v, dict):
                return _safe(v.get('usd'))
            return _safe(v)

        price  = usd('current_price')
        mc     = usd('market_cap')
        vol    = usd('total_volume')
        vol_mc = round(vol / mc, 4) if vol and mc else None

        ath        = usd('ath')
        ath_date   = (md.get('ath_date') or {}).get('usd', '')
        ath_change = pct('ath_change_percentage')

        atl        = usd('atl')
        atl_date   = (md.get('atl_date') or {}).get('usd', '')
        atl_change = pct('atl_change_percentage')

        circ  = _safe(md.get('circulating_supply'))
        total = _safe(md.get('total_supply'))
        mx    = _safe(md.get('max_supply'))

        result = {
            'id':       data.get('id', cg_id),
            'symbol':   sym,
            'name':     name,
            'image':    (data.get('image') or {}).get('large', ''),
            'rank':     data.get('market_cap_rank'),
            'price':    price,
            'marketCap':   mc,
            'fdv':         usd('fully_diluted_valuation'),
            'volume24h':   vol,
            'volMcapRatio': vol_mc,
            'high24h':  usd('high_24h'),
            'low24h':   usd('low_24h'),
            'change1h':  pct('price_change_percentage_1h_in_currency'),
            'change24h': pct('price_change_percentage_24h_in_currency'),
            'change7d':  pct('price_change_percentage_7d_in_currency'),
            'change30d': pct('price_change_percentage_30d_in_currency'),
            'ath':       ath,
            'athDate':   ath_date[:10] if ath_date else None,
            'athChange': ath_change,
            'atl':       atl,
            'atlDate':   atl_date[:10] if atl_date else None,
            'atlChange': atl_change,
            'circulatingSupply': circ,
            'totalSupply':       total,
            'maxSupply':         mx,
            'yfTicker':  f'{sym}-USD',
        }
        _set(cache_key, result, 30)
        return result
    except Exception as e:
        print(f'[crypto] coin_info parse error: {e}')
        return None