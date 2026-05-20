"""
Politician stock trade tracker via Financial Modeling Prep (FMP) free API.
House + Senate STOCK Act disclosures.

Requires FMP_API_KEY env var.  Free key: https://financialmodelingprep.com/register
Free tier: 250 requests/day — sufficient given 6-hour cache.
"""
import os
import time
import threading
import requests
from datetime import datetime, date

FMP_BASE        = "https://financialmodelingprep.com/stable"
FMP_LEGACY_BASE = "https://financialmodelingprep.com/api/v4"
CACHE_TTL = 21600   # 6 hours
_TIMEOUT  = 20

_cache: dict = {"trades": [], "ts": 0.0}
_lock = threading.Lock()

NO_KEY_MSG = "FMP_API_KEY not set. Get a free key at financialmodelingprep.com/register and add FMP_API_KEY=<key> to your server/.env file."


def _api_key() -> str | None:
    return os.getenv("FMP_API_KEY") or os.getenv("FINANCIAL_MODELING_PREP_API_KEY")


def _parse_senate_row(t, ticker_override=None):
    ticker = ticker_override or (t.get("ticker") or "").strip().upper()
    name = (t.get("name") or
            f"{t.get('firstName', '')} {t.get('lastName', '')}".strip() or
            t.get("senator", ""))
    return {
        "chamber":    "Senate",
        "politician": name,
        "party":      t.get("party", ""),
        "state":      t.get("state", ""),
        "ticker":     ticker,
        "asset":      t.get("assetDescription", "") or t.get("asset_description", ""),
        "tx_type":    t.get("type", "") or t.get("transactionType", ""),
        "amount":     t.get("amount", ""),
        "tx_date":    t.get("transactionDate", "") or t.get("transaction_date", ""),
        "disclosed":  t.get("dateRecieved", "") or t.get("disclosureDate", "") or t.get("disclosure_date", ""),
    }


def _parse_house_row(t, ticker_override=None):
    ticker = ticker_override or (t.get("ticker") or "").strip().upper()
    name = (t.get("representative") or t.get("name") or
            f"{t.get('firstName', '')} {t.get('lastName', '')}".strip())
    return {
        "chamber":    "House",
        "politician": name,
        "party":      t.get("party", ""),
        "state":      t.get("state", ""),
        "ticker":     ticker,
        "asset":      t.get("assetDescription", "") or t.get("asset_description", ""),
        "tx_type":    t.get("type", "") or t.get("transactionType", ""),
        "amount":     t.get("amount", ""),
        "tx_date":    t.get("transactionDate", "") or t.get("transaction_date", ""),
        "disclosed":  t.get("disclosureDate", "") or t.get("dateRecieved", "") or t.get("disclosure_date", ""),
    }


def _fmp_get(path: str, params: dict, api_key: str) -> list:
    """Try stable endpoint first, fall back to legacy v4."""
    last_err = None
    for base in (FMP_BASE, FMP_LEGACY_BASE):
        try:
            r = requests.get(
                f"{base}/{path}",
                params={**params, "apikey": api_key},
                timeout=_TIMEOUT,
            )
            if r.status_code == 404:
                continue
            if r.status_code == 401:
                # Invalid key — surface immediately
                msg = r.json().get("Error Message", "Invalid FMP API key")
                raise ValueError(msg)
            if r.status_code == 403:
                # Legacy endpoint blocked for this key — skip, try next base
                last_err = r.json().get("Error Message", "Endpoint not available")
                continue
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list):
                return data
        except ValueError:
            raise
        except Exception:
            continue
    return []


def _fetch_senate(api_key: str) -> list[dict]:
    out = []
    page = 0
    while True:
        try:
            rows = _fmp_get("senate-trading-rss-feed", {"page": page}, api_key)
            if not rows:
                break
            for t in rows:
                ticker = (t.get("ticker") or "").strip().upper()
                if not ticker or ticker in ("--", "N/A", ""):
                    continue
                out.append(_parse_senate_row(t))
            if len(rows) < 50:
                break
            page += 1
            if page > 20:
                break
        except Exception:
            break
    return out


def _fetch_house(api_key: str) -> list[dict]:
    out = []
    page = 0
    while True:
        try:
            rows = _fmp_get("house-disclosure-rss-feed", {"page": page}, api_key)
            if not rows:
                break
            for t in rows:
                ticker = (t.get("ticker") or "").strip().upper()
                if not ticker or ticker in ("--", "N/A", ""):
                    continue
                out.append(_parse_house_row(t))
            if len(rows) < 50:
                break
            page += 1
            if page > 20:
                break
        except Exception:
            break
    return out


def _fetch_ticker_senate(ticker: str, api_key: str) -> list[dict]:
    try:
        rows = _fmp_get("senate-trade", {"symbol": ticker}, api_key)
        if not rows:
            # fallback endpoint name
            rows = _fmp_get("senate-trading", {"symbol": ticker}, api_key)
        return [_parse_senate_row(t, ticker.upper()) for t in rows]
    except Exception:
        return []


def _fetch_ticker_house(ticker: str, api_key: str) -> list[dict]:
    try:
        rows = _fmp_get("house-disclosure-trade", {"symbol": ticker}, api_key)
        if not rows:
            rows = _fmp_get("house-disclosure", {"symbol": ticker}, api_key)
        return [_parse_house_row(t, ticker.upper()) for t in rows]
    except Exception:
        return []




def _refresh_bulk(api_key: str):
    senate = _fetch_senate(api_key)
    house  = _fetch_house(api_key)
    with _lock:
        _cache["trades"] = senate + house
        _cache["ts"] = time.time()


def _sort_key(t):
    raw = t.get("tx_date") or t.get("disclosed") or ""
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d")
    except Exception:
        return datetime.min


def get_trades(
    ticker:  str | None = None,
    chamber: str = "all",
    tx_type: str = "all",
    days:    int = 90,
    limit:   int = 200,
) -> list[dict] | dict:
    api_key = _api_key()
    if not api_key:
        return {"error": NO_KEY_MSG}

    # For specific ticker, hit per-ticker endpoints (faster, no bulk cache needed)
    if ticker:
        t = ticker.strip().upper()
        rows: list[dict] = []
        if chamber in ("all", "senate"):
            rows += _fetch_ticker_senate(t, api_key)
        if chamber in ("all", "house"):
            rows += _fetch_ticker_house(t, api_key)
        rows.sort(key=_sort_key, reverse=True)
        return _apply_filters(rows, None, tx_type, days, limit)

    # No ticker: use bulk cache
    with _lock:
        stale = (time.time() - _cache["ts"]) > CACHE_TTL
    if stale:
        _refresh_bulk(api_key)

    with _lock:
        if chamber == "house":
            rows = [t for t in _cache["trades"] if t["chamber"] == "House"]
        elif chamber == "senate":
            rows = [t for t in _cache["trades"] if t["chamber"] == "Senate"]
        else:
            rows = list(_cache["trades"])

    return _apply_filters(rows, None, tx_type, days, limit)


def _apply_filters(rows, ticker, tx_type, days, limit):
    cutoff = None
    if days and days > 0:
        cutoff = date.today().toordinal() - days

    filtered = []
    for t in rows:
        if tx_type != "all":
            if tx_type.lower() not in (t.get("tx_type") or "").lower():
                continue
        if cutoff:
            raw = t.get("tx_date") or t.get("disclosed") or ""
            try:
                d = datetime.strptime(raw[:10], "%Y-%m-%d").date().toordinal()
                if d < cutoff:
                    continue
            except Exception:
                pass
        filtered.append(t)

    filtered.sort(key=_sort_key, reverse=True)
    return filtered[:limit]


def get_stats(ticker: str | None = None, days: int = 90) -> dict:
    api_key = _api_key()
    if not api_key:
        return {"error": NO_KEY_MSG}

    result = get_trades(ticker=ticker, days=days, limit=5000)
    if isinstance(result, dict) and "error" in result:
        return result

    trades = result
    buys  = [t for t in trades if "purchase" in (t.get("tx_type") or "").lower()]
    sells = [t for t in trades if "sale"     in (t.get("tx_type") or "").lower()]

    top_buyers: dict[str, int] = {}
    for t in buys:
        p = t["politician"]
        top_buyers[p] = top_buyers.get(p, 0) + 1
    top_sellers: dict[str, int] = {}
    for t in sells:
        p = t["politician"]
        top_sellers[p] = top_sellers.get(p, 0) + 1

    return {
        "total":       len(trades),
        "buys":        len(buys),
        "sells":       len(sells),
        "top_buyers":  sorted(top_buyers.items(),  key=lambda x: -x[1])[:5],
        "top_sellers": sorted(top_sellers.items(), key=lambda x: -x[1])[:5],
    }