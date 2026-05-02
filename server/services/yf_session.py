"""Shared yfinance session using curl_cffi Chrome impersonation to avoid rate limits."""
from curl_cffi import requests as cffi_requests

_session = None

# Common shorthand → yfinance symbol mapping.
# yfinance requires the caret prefix for indices.
_ALIASES = {
    'SPX':    '^GSPC',   # S&P 500
    'GSPC':   '^GSPC',
    'DJI':    '^DJI',    # Dow Jones
    'DJIA':   '^DJI',
    'NDX':    '^NDX',    # Nasdaq 100
    'COMP':   '^IXIC',   # Nasdaq Composite
    'IXIC':   '^IXIC',
    'RUT':    '^RUT',    # Russell 2000
    'VIX':    '^VIX',    # CBOE Volatility Index
    'TNX':    '^TNX',    # 10-Year Treasury yield
    'TYX':    '^TYX',    # 30-Year Treasury yield
    'IRX':    '^IRX',    # 13-week Treasury yield
    'FTSE':   '^FTSE',   # FTSE 100
    'DAX':    '^GDAXI',  # DAX
    'NIKKEI': '^N225',   # Nikkei 225
    'N225':   '^N225',
}


def get_session():
    global _session
    if _session is None:
        _session = cffi_requests.Session(impersonate='chrome')
    return _session


def resolve(symbol: str) -> str:
    """Resolve common shorthand aliases to yfinance-compatible symbols."""
    return _ALIASES.get(symbol.upper(), symbol)


def ticker(symbol: str):
    import yfinance as yf
    return yf.Ticker(resolve(symbol), session=get_session())