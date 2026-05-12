"""ATH Catalyst Scanner — finds stocks near all-time highs with upcoming earnings + smart money signals.

Pro checklist (1 point each, max score 5):
  1. Near ATH      — price within 5% of 52-week high
  2. Earnings      — earnings in next 30 days
  3. Vol Surge     — today's volume > 1.5× 3-month average
  4. Hot Sector    — AI / semiconductor / cloud / software
  5. Analyst Up    — analyst consensus target > 10% upside
"""
import time
import pandas as pd
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from server.services.yf_session import ticker as yf_ticker

HOT_SECTORS = {'technology', 'communication services'}
HOT_INDUSTRIES = {
    'semiconductors', 'semiconductor equipment & materials',
    'software—infrastructure', 'software—application',
    'internet content & information', 'data storage',
    'electronic components', 'computer hardware',
    'consumer electronics', 'information technology services',
}

SECTOR_ETFS = [
    ('SPY',  'S&P 500'),
    ('QQQ',  'Nasdaq 100'),
    ('XLK',  'Technology'),
    ('SMH',  'Semiconductors'),
    ('SOXX', 'Semis (SOXX)'),
    ('XLF',  'Financials'),
    ('XLE',  'Energy'),
    ('XLV',  'Healthcare'),
    ('XLI',  'Industrials'),
    ('XLY',  'Consumer Discr.'),
    ('XLC',  'Comm. Services'),
    ('ARKK', 'Innovation'),
    ('GDX',  'Gold Miners'),
]

UNIVERSE = [
    # Mega-cap tech
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'AMD', 'AVGO', 'QCOM',
    # AI / Semiconductors (large-cap)
    'MU', 'AMAT', 'LRCX', 'MRVL', 'SMCI', 'ARM', 'ASML', 'TSM', 'TXN', 'ADI',
    # Mid-cap Semiconductors
    'MPWR', 'ONTO', 'ACLS', 'ALGM', 'SITM', 'FORM', 'WOLF', 'AMBA',
    # Cloud / SaaS (large-cap)
    'SNOW', 'DDOG', 'PLTR', 'NET', 'CRWD', 'PANW', 'MDB', 'WDAY', 'ZS', 'TEAM',
    # Enterprise Cloud / AI Platform
    'NOW', 'CRM', 'ORCL', 'FTNT', 'S', 'HUBS',
    # Finance / Fintech
    'JPM', 'GS', 'V', 'MA', 'COIN', 'BLK', 'SOFI', 'NU',
    # Healthcare / Biotech
    'LLY', 'UNH', 'ABBV', 'MRNA', 'ISRG', 'VRTX', 'HIMS', 'RXRX', 'ROIV',
    # Consumer / Streaming
    'NFLX', 'UBER', 'SHOP', 'WMT', 'COST', 'HD', 'ABNB', 'DASH', 'SPOT',
    # Energy
    'XOM', 'OXY', 'CVX', 'SLB',
    # High-growth Momentum
    'MSTR', 'APP', 'TTD', 'DUOL', 'HOOD', 'RBLX', 'AXON', 'CELH', 'CAVA',
    # Small-cap Momentum — low float, high beta, catalyst-driven (MRAM pattern)
    # These move 20-100%+ in a day on news + thin float; floatRatio is the key signal
    'SOUN', 'BBAI', 'IONQ', 'ASTS', 'RGTI', 'QUBT', 'KULR', 'NVTS', 'AEHR',
]
UNIVERSE = list(dict.fromkeys(UNIVERSE))  # deduplicate

# ── Low Float Momentum Universe ───────────────────────────────────────────────
# Small-cap / micro-cap stocks with thin floats that move 20–100%+ on catalysts.
# Key signal: floatRatio (today's volume as % of float). >5% = unusual; >50% = MRAM-type.
LOW_FLOAT_UNIVERSE = [
    # Small-cap Semiconductors (the MRAM archetype)
    'MRAM', 'AEHR', 'NVTS', 'SITM', 'ALGM', 'FORM', 'ACLS', 'AMBA', 'WOLF',
    'DIOD', 'POWI', 'CRUS', 'SLAB', 'ONTO',
    # Extended small-cap semis — similar DNA to MRAM
    'NVEC',   # NVE Corp — spintronics (closest science to MRAM, tiny float ~7M)
    'COHU',   # Cohu — semiconductor test equipment
    'ICHR',   # Ichor Holdings — semiconductor fluid components
    'SMTC',   # Semtech — IoT/LoRa chips
    'LSCC',   # Lattice Semiconductor — FPGAs
    'CRDO',   # Credo Technology — high-speed connectivity
    'CAMT',   # Camtek — semiconductor inspection
    'KLIC',   # Kulicke & Soffa — advanced packaging
    # Small-cap AI / Quantum Computing
    'SOUN', 'BBAI', 'IONQ', 'RGTI', 'QUBT', 'KULR', 'ASTS',
    # Small-cap AI / Enterprise Software
    'AI',     # C3.ai — enterprise AI, volatile small-cap
    'CLBT',   # Cellebrite — digital intelligence
    # LiDAR / Autonomy — thin float, catalyst-driven
    'MVIS',   # MicroVision — LiDAR, float ~100M, moves violently on news
    'LAZR',   # Luminar Technologies — autonomous driving sensors
    'INVZ',   # Innoviz Technologies — automotive LiDAR
    # eVTOL / Space — thin float, speculative beta
    'JOBY',   # Joby Aviation — eVTOL air taxi
    'ACHR',   # Archer Aviation — eVTOL
    'RKLB',   # Rocket Lab — small-cap space launch
    'PL',     # Planet Labs — satellite imagery
    # Small-cap Biotech / Healthcare
    'RXRX', 'HIMS', 'ROIV', 'VKTX', 'MDGL',
    'NVAX',   # Novavax — volatile vaccine biotech
    'IMVT',   # Immunovant — autoimmune
    'NKTR',   # Nektar Therapeutics — drug delivery
    # EV / Clean Energy — thin float, sentiment-driven
    'CHPT',   # ChargePoint — EV charging infrastructure
    'BLNK',   # Blink Charging — EV charging, very thin float
    'NKLA',   # Nikola — hydrogen/EV, high beta
    # Small-cap Fintech / Growth
    'SOFI', 'HOOD', 'UPST', 'AFRM',
    # High-beta consumer / growth
    'CELH', 'CAVA', 'RDDT', 'DUOL',
]
LOW_FLOAT_UNIVERSE = list(dict.fromkeys(LOW_FLOAT_UNIVERSE))


def _nearest_earnings(ticker) -> tuple | None:
    try:
        ed = ticker.earnings_dates
        if ed is None or ed.empty:
            return None
        now = pd.Timestamp.now(tz='UTC')
        cutoff = now + pd.Timedelta(days=30)
        future = ed[(ed.index.normalize() >= now.normalize()) & (ed.index <= cutoff)]
        if future.empty:
            return None
        dt = future.index[-1]
        days_away = max(1, (dt.date() - now.date()).days)
        return dt, days_away
    except Exception:
        return None


def _analyze_stock(symbol: str) -> dict | None:
    try:
        t = yf_ticker(symbol)

        # Fast info — single lightweight request
        try:
            fi = t.fast_info
            price      = fi.last_price
            year_high  = fi.year_high
            avg_vol    = fi.three_month_average_volume or 0
            today_vol  = fi.last_volume or 0
            prev_close = fi.previous_close or price
            market_cap = fi.market_cap or 0
        except Exception:
            return None

        if not price or not year_high or price < 2 or avg_vol < 50_000:
            return None

        # Criterion 1: Near ATH
        ath_pct = (price / year_high) * 100
        near_ath = ath_pct >= 95.0

        # Criterion 3: Volume surge
        vol_ratio = today_vol / avg_vol if avg_vol > 0 else 1.0
        vol_surge = vol_ratio >= 1.5

        # Criterion 2: Upcoming earnings
        upcoming_earnings = False
        days_to_earnings = None
        earnings_date_str = None
        try:
            res = _nearest_earnings(t)
            if res:
                dt, days_away = res
                upcoming_earnings = True
                days_to_earnings = days_away
                earnings_date_str = dt.strftime('%Y-%m-%d')
        except Exception:
            pass

        # Criteria 4 & 5: Sector + analyst target (slower info call)
        sector = ''
        industry = ''
        analyst_target = None
        short_name = symbol
        float_shares = None
        try:
            info = t.info
            sector        = (info.get('sector')    or '').lower()
            industry      = (info.get('industry')  or '').lower()
            analyst_target = info.get('targetMeanPrice')
            short_name    = info.get('shortName') or symbol
            float_shares  = info.get('floatShares') or info.get('impliedSharesOutstanding')
        except Exception:
            pass

        # Float ratio: today's volume as % of float — the key MRAM-type signal.
        # >10% = unusually high; >50% = short-squeeze / news-driven explosion.
        float_ratio = round(today_vol / float_shares, 3) if float_shares and float_shares > 0 else None

        hot_sector = (
            sector in HOT_SECTORS or
            any(h in industry for h in HOT_INDUSTRIES)
        )

        analyst_upside = False
        upside_pct = None
        if analyst_target and price:
            upside_pct = (analyst_target - price) / price * 100
            analyst_upside = upside_pct >= 10.0

        pro_score = sum([near_ath, upcoming_earnings, vol_surge, hot_sector, analyst_upside])
        if pro_score < 2:
            return None

        # ATH Date — fetch weekly history only for stocks that pass the score filter
        # (weekly bars = 52 rows max, fast & lightweight)
        ath_date_str = None
        days_since_ath = None
        try:
            hist = t.history(period='1y', interval='1wk')
            if not hist.empty:
                ath_idx = hist['High'].idxmax()
                if ath_idx is not None:
                    ath_dt = pd.Timestamp(ath_idx).date()
                    now_dt = datetime.utcnow().date()
                    days_since_ath = (now_dt - ath_dt).days
                    if days_since_ath <= 7:
                        ath_date_str = 'This week'
                    elif days_since_ath <= 14:
                        ath_date_str = 'Last week'
                    elif days_since_ath <= 60:
                        weeks = days_since_ath // 7
                        ath_date_str = f'{weeks}w ago'
                    elif days_since_ath <= 365:
                        months = days_since_ath // 30
                        ath_date_str = f'{months}mo ago'
                    else:
                        ath_date_str = ath_dt.strftime('%b %Y')
        except Exception:
            pass

        # Pre-ER phase — classify how far before earnings the stock is
        pre_er_phase = None
        weeks_to_earnings = None
        if days_to_earnings is not None:
            weeks_to_earnings = round(days_to_earnings / 7, 1)
            if days_to_earnings <= 7:
                pre_er_phase = 'imminent'      # < 1 week
            elif days_to_earnings <= 14:
                pre_er_phase = 'hot_zone'      # 1-2 weeks
            elif days_to_earnings <= 28:
                pre_er_phase = 'sweet_spot'    # 2-4 weeks — ideal entry
            elif days_to_earnings <= 56:
                pre_er_phase = 'positioning'   # 4-8 weeks — early accumulation
            else:
                pre_er_phase = 'early'         # > 8 weeks

        today_change_pct = round((price - prev_close) / prev_close * 100, 2) if prev_close else None

        def fmt_mcap(v):
            if not v: return None
            if v >= 1e12: return f'${v/1e12:.1f}T'
            if v >= 1e9:  return f'${v/1e9:.1f}B'
            return f'${v/1e6:.0f}M'

        return {
            'symbol':           symbol,
            'shortName':        short_name,
            'price':            round(float(price), 2),
            'yearHigh':         round(float(year_high), 2),
            'athPct':           round(float(ath_pct), 1),
            'distFromATH':      round(100.0 - float(ath_pct), 1),
            'nearATH':          near_ath,
            'athDate':          ath_date_str,
            'daysSinceATH':     days_since_ath,
            'volRatio':         round(float(vol_ratio), 2),
            'volSurge':         vol_surge,
            'todayChangePct':   today_change_pct,
            'upcomingEarnings': upcoming_earnings,
            'daysToEarnings':   days_to_earnings,
            'weeksToEarnings':  weeks_to_earnings,
            'earningsDate':     earnings_date_str,
            'preErPhase':       pre_er_phase,
            'sector':           sector.title() if sector else 'Unknown',
            'industry':         industry.title() if industry else '',
            'hotSector':        hot_sector,
            'analystTarget':    round(float(analyst_target), 2) if analyst_target else None,
            'analystUpside':    analyst_upside,
            'upsidePct':        round(float(upside_pct), 1) if upside_pct is not None else None,
            'marketCap':        fmt_mcap(market_cap),
            'marketCapRaw':     market_cap,
            'floatShares':      float_shares,
            'floatRatio':       float_ratio,
            'proScore':         pro_score,
            'criteria': {
                'nearATH':          near_ath,
                'upcomingEarnings': upcoming_earnings,
                'volSurge':         vol_surge,
                'hotSector':        hot_sector,
                'analystUpside':    analyst_upside,
            },
        }
    except Exception:
        return None


def get_stock_catalyst(symbol: str) -> dict:
    """Run ATH catalyst analysis for a single stock (used by the Analyzer)."""
    result = _analyze_stock(symbol.upper())
    if result:
        return result
    # Return a minimal response even if stock doesn't score 2+
    try:
        t = yf_ticker(symbol.upper())
        fi = t.fast_info
        price     = fi.last_price
        year_high = fi.year_high
        if price and year_high:
            ath_pct = (price / year_high) * 100
            return {
                'symbol':      symbol.upper(),
                'price':       round(float(price), 2),
                'yearHigh':    round(float(year_high), 2),
                'athPct':      round(float(ath_pct), 1),
                'distFromATH': round(100.0 - float(ath_pct), 1),
                'nearATH':     ath_pct >= 95.0,
                'proScore':    0,
                'lowScore':    True,
                'criteria':    {'nearATH': False, 'upcomingEarnings': False, 'volSurge': False, 'hotSector': False, 'analystUpside': False},
            }
    except Exception:
        pass
    return {'symbol': symbol.upper(), 'error': 'No data available', 'proScore': 0}


def scan_ath_catalysts(min_score: int = 2) -> dict:
    results = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_analyze_stock, s): s for s in UNIVERSE}
        for fut in as_completed(futures, timeout=90):
            try:
                r = fut.result(timeout=10)
                if r and r['proScore'] >= min_score:
                    results.append(r)
            except Exception:
                pass

    results.sort(key=lambda x: (-x['proScore'], -(x['volRatio'] or 1)))
    return {
        'results':   results,
        'count':     len(results),
        'scannedAt': datetime.utcnow().isoformat(),
    }


def get_sector_momentum() -> dict:
    def _fetch(sym_name: tuple) -> dict | None:
        sym, name = sym_name
        try:
            hist = yf_ticker(sym).history(period='1mo', interval='1d')
            if hist.empty or len(hist) < 5:
                return None
            closes = hist['Close'].dropna()
            now_p  = float(closes.iloc[-1])
            p1d    = float(closes.iloc[-2])  if len(closes) >= 2  else now_p
            p5d    = float(closes.iloc[-6])  if len(closes) >= 6  else float(closes.iloc[0])
            p20d   = float(closes.iloc[0])
            return {
                'symbol':    sym,
                'name':      name,
                'price':     round(now_p, 2),
                'change1d':  round((now_p - p1d)  / p1d  * 100, 2),
                'change5d':  round((now_p - p5d)  / p5d  * 100, 2),
                'change20d': round((now_p - p20d) / p20d * 100, 2),
            }
        except Exception:
            return None

    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch, s): s for s in SECTOR_ETFS}
        for fut in as_completed(futures, timeout=30):
            r = fut.result()
            if r:
                results.append(r)

    results.sort(key=lambda x: x['change5d'], reverse=True)
    return {
        'sectors':   results,
        'scannedAt': datetime.utcnow().isoformat(),
    }


# ── Low Float Momentum Scanner ────────────────────────────────────────────────

def _analyze_low_float(symbol: str) -> dict | None:
    """Score a stock on low-float momentum criteria (MRAM pattern)."""
    try:
        t = yf_ticker(symbol)

        try:
            fi = t.fast_info
            price      = fi.last_price
            year_high  = fi.year_high
            avg_vol    = fi.three_month_average_volume or 0
            today_vol  = fi.last_volume or 0
            prev_close = fi.previous_close or price
            market_cap = fi.market_cap or 0
        except Exception:
            return None

        if not price or not year_high or price < 0.5:
            return None

        ath_pct          = (price / year_high) * 100
        vol_ratio        = today_vol / avg_vol if avg_vol > 0 else 1.0
        today_change_pct = round((price - prev_close) / prev_close * 100, 2) if prev_close else 0.0

        float_shares = None
        sector       = ''
        industry     = ''
        short_name   = symbol
        try:
            info         = t.info
            float_shares = info.get('floatShares') or info.get('impliedSharesOutstanding')
            sector       = (info.get('sector')   or '').lower()
            industry     = (info.get('industry') or '').lower()
            short_name   = info.get('shortName') or symbol
        except Exception:
            pass

        float_ratio = (today_vol / float_shares) if float_shares and float_shares > 0 else None

        # Scoring criteria — each worth 1 point
        low_float    = bool(float_shares) and float_shares < 100_000_000   # < 100M float
        float_surge  = float_ratio is not None and float_ratio >= 0.05      # > 5% of float traded
        vol_surge    = vol_ratio >= 2.0                                      # > 2× avg volume
        near_high    = ath_pct >= 80.0                                       # within 20% of 52-wk high
        momentum_day = today_change_pct >= 3.0                               # up 3%+ today

        score = sum([low_float, float_surge, vol_surge, near_high, momentum_day])
        if score < 2:
            return None

        def fmt_float(v):
            if not v: return '—'
            if v >= 1e9: return f'{v/1e9:.1f}B'
            if v >= 1e6: return f'{v/1e6:.0f}M'
            return f'{int(v/1e3)}K'

        def fmt_mcap(v):
            if not v: return '—'
            if v >= 1e12: return f'${v/1e12:.1f}T'
            if v >= 1e9:  return f'${v/1e9:.1f}B'
            return f'${v/1e6:.0f}M'

        return {
            'symbol':         symbol,
            'shortName':      short_name,
            'price':          round(float(price), 2),
            'yearHigh':       round(float(year_high), 2),
            'athPct':         round(float(ath_pct), 1),
            'distFromHigh':   round(100.0 - float(ath_pct), 1),
            'nearHigh':       near_high,
            'volRatio':       round(float(vol_ratio), 2),
            'volSurge':       vol_surge,
            'todayChangePct': today_change_pct,
            'momentumDay':    momentum_day,
            'floatShares':    float_shares,
            'floatFmt':       fmt_float(float_shares),
            'floatRatio':     round(float(float_ratio), 4) if float_ratio is not None else None,
            'floatRatioPct':  round(float(float_ratio) * 100, 1) if float_ratio is not None else None,
            'lowFloat':       low_float,
            'floatSurge':     float_surge,
            'marketCap':      fmt_mcap(market_cap),
            'marketCapRaw':   market_cap,
            'sector':         sector.title() if sector else 'Unknown',
            'industry':       industry.title() if industry else '',
            'score':          score,
            'criteria': {
                'lowFloat':    low_float,
                'floatSurge':  float_surge,
                'volSurge':    vol_surge,
                'nearHigh':    near_high,
                'momentumDay': momentum_day,
            },
        }
    except Exception:
        return None


def scan_low_float_momentum() -> dict:
    results = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_analyze_low_float, s): s for s in LOW_FLOAT_UNIVERSE}
        for fut in as_completed(futures, timeout=90):
            try:
                r = fut.result(timeout=10)
                if r:
                    results.append(r)
            except Exception:
                pass

    results.sort(key=lambda x: (-x['score'], -(x['floatRatio'] or 0)))
    return {
        'results':   results,
        'count':     len(results),
        'scannedAt': datetime.utcnow().isoformat(),
    }
