"""Pre-Rocket Scanner — identifies stocks likely to make big moves in next 15/30/60 days.

Reuses:
  - scanner._fetch_bars_yf + _add_indicators + _score   (technical setup)
  - ath_scanner._nearest_earnings                        (catalyst date)
  - theme_rocket_scanner.THEME_UNIVERSE                  (hot-theme membership)

Scoring (0-10):
  Technical setup  0-4   (scanner score ≥70→4, ≥50→3, ≥30→2, >0→1)
  Catalyst date    0-3   (earnings ≤15d→3, ≤30d→2, ≤60d→1)
  Peer momentum    0-2   (peers in same theme already up 50%+ in 30d)
  Short squeeze    0-1   (short float >12%)
"""
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

from server.services.scanner import _fetch_bars_yf, _add_indicators, _score
from server.services.ath_scanner import _nearest_earnings
from server.services.theme_rocket_scanner import THEME_UNIVERSE
from server.services.yf_session import ticker as yf_ticker


def _get_short_pct(t) -> float | None:
    try:
        info = t.info or {}
        v = info.get('shortPercentOfFloat') or info.get('shortRatio')
        if v and v > 1:
            v = v / 100
        return round(float(v), 4) if v else None
    except Exception:
        return None


def _peer_run_count(symbol: str, themes: list[str], peer_gains: dict[str, float]) -> int:
    """Count how many theme peers are already up 50%+ in last 30d."""
    count = 0
    for theme in themes:
        for peer in THEME_UNIVERSE.get(theme, []):
            if peer != symbol and peer_gains.get(peer, 0) >= 50:
                count += 1
    return min(count, 4)  # cap raw count


def _fetch_30d_gain(symbol: str) -> float | None:
    try:
        t = yf_ticker(symbol)
        hist = t.history(period='35d', interval='1d', auto_adjust=True)
        if hist is None or len(hist) < 20:
            return None
        price_now  = float(hist['Close'].iloc[-1])
        price_30d  = float(hist['Close'].iloc[0])
        if price_30d <= 0:
            return None
        return (price_now - price_30d) / price_30d * 100
    except Exception:
        return None


def _analyze_symbol(symbol: str, themes: list[str], peer_gains: dict[str, float]) -> dict | None:
    try:
        t = yf_ticker(symbol)

        # ── Technical score (reuse scanner) ──────────────────────────────────
        df = _fetch_bars_yf(symbol)
        tech_score = 0
        tech_signal = 'NEUTRAL'
        stop_loss = take_profit = price = None
        rsi = vol_ratio = None
        coil = False

        if df is not None and not df.empty and len(df) >= 50:
            score, reasons, cond = _score(df, symbol)
            tech_score  = score
            tech_signal = cond.get('signal', 'NEUTRAL')
            price       = cond.get('price')
            stop_loss   = cond.get('stop_loss')
            take_profit = cond.get('take_profit')
            rsi         = cond.get('rsi')
            vol_ratio   = cond.get('volume_ratio')

            # Coil: Bollinger squeeze + near 52w high
            if len(df) >= 20:
                df2 = _add_indicators(df)
                last = df2.iloc[-1]
                bb_w = (last.get('bb_upper', 0) - last.get('bb_lower', 0))
                bb_w_pct = bb_w / last.get('close', 1) * 100 if last.get('close') else 99
                atr_pct  = last.get('atr_pct', 99)
                year_high = t.fast_info.year_high if hasattr(t, 'fast_info') else None
                near_high = price and year_high and (price / year_high) >= 0.88
                coil = bool(bb_w_pct < 6 and atr_pct < 4 and bool(near_high))
        else:
            # Fallback: get price from fast_info
            try:
                fi    = t.fast_info
                price = fi.last_price
            except Exception:
                pass

        if not price or price < 2:
            return None

        # ── Catalyst (earnings date) ──────────────────────────────────────────
        earnings_days = None
        earnings_date = None
        try:
            res = _nearest_earnings(t)
            if res:
                dt, days_away = res
                earnings_days = days_away
                earnings_date = dt.strftime('%Y-%m-%d')
        except Exception:
            pass

        # ── Short interest ────────────────────────────────────────────────────
        short_pct = _get_short_pct(t)

        # ── 30d gain (to exclude already-rocketed stocks) ─────────────────────
        gain_30d = peer_gains.get(symbol)

        # ── Scoring ───────────────────────────────────────────────────────────
        # Technical: 0-4
        if tech_score >= 70:
            t_pts = 4
        elif tech_score >= 50:
            t_pts = 3
        elif tech_score >= 30:
            t_pts = 2
        elif tech_score > 0:
            t_pts = 1
        else:
            t_pts = 0

        # Catalyst: 0-3
        if earnings_days is not None and earnings_days <= 15:
            c_pts = 3
        elif earnings_days is not None and earnings_days <= 30:
            c_pts = 2
        elif earnings_days is not None and earnings_days <= 60:
            c_pts = 1
        else:
            c_pts = 0

        # Peer momentum: 0-2
        raw_peers = _peer_run_count(symbol, themes, peer_gains)
        p_pts = 2 if raw_peers >= 3 else (1 if raw_peers >= 1 else 0)

        # Short squeeze: 0-1
        s_pts = 1 if (short_pct or 0) >= 0.12 else 0

        # Coil bonus: 0-1
        k_pts = 1 if coil else 0

        total = t_pts + c_pts + p_pts + s_pts + k_pts
        pre_rocket_score = min(round(total / 11 * 10, 1), 10)

        # Horizon bucket
        if earnings_days is not None and earnings_days <= 15:
            horizon = '15d'
        elif earnings_days is not None and earnings_days <= 30:
            horizon = '30d'
        elif earnings_days is not None and earnings_days <= 60:
            horizon = '60d'
        else:
            horizon = '60d+'

        # Build signal labels
        signals = []
        if t_pts >= 3:
            signals.append('Tech Setup ✅')
        elif t_pts >= 1:
            signals.append('Partial Setup')
        if c_pts == 3:
            signals.append(f'Earnings {earnings_days}d 🔥')
        elif c_pts >= 1:
            signals.append(f'Earnings {earnings_days}d')
        if p_pts >= 1:
            signals.append(f'{raw_peers} peers ran')
        if s_pts:
            signals.append(f'Short {round((short_pct or 0)*100)}%')
        if k_pts:
            signals.append('Coiling 🪄')

        try:
            short_name = (t.info or {}).get('shortName') or symbol
        except Exception:
            short_name = symbol

        def _f(v, decimals=2):
            return round(float(v), decimals) if v is not None else None

        return {
            'symbol':          symbol,
            'shortName':       short_name,
            'themes':          themes,
            'primaryTheme':    themes[0] if themes else '',
            'price':           _f(price),
            'gain30d':         _f(gain_30d, 1) if gain_30d is not None else None,
            'preRocketScore':  float(pre_rocket_score),
            'techScore':       float(tech_score),
            'techSignal':      tech_signal,
            'rsi':             _f(rsi, 1),
            'volRatio':        _f(vol_ratio),
            'earningsDays':    int(earnings_days) if earnings_days is not None else None,
            'earningsDate':    earnings_date,
            'horizon':         horizon,
            'shortPct':        _f((short_pct or 0) * 100, 1),
            'coil':            coil,
            'peerRunCount':    int(raw_peers),
            'stopLoss':        _f(stop_loss),
            'takeProfit':      _f(take_profit),
            'signals':         signals,
            'breakdown': {
                'tech':     t_pts,
                'catalyst': c_pts,
                'peers':    p_pts,
                'short':    s_pts,
                'coil':     k_pts,
            },
        }
    except Exception as e:
        print(f"[pre-rocket] {symbol}: {e}")
        return None


def scan_pre_rockets(max_gain_filter: float = 40.0) -> dict:
    """Find stocks in hot themes that haven't run yet but show pre-rocket signals.

    max_gain_filter: exclude stocks already up more than this % in last 30d
    (those are Theme Rockets, already ran — we want the NEXT ones).
    """
    # Step 1: Build symbol→themes map
    sym_themes: dict[str, list[str]] = {}
    for theme, syms in THEME_UNIVERSE.items():
        for s in syms:
            sym_themes.setdefault(s, []).append(theme)

    # Step 2: Fetch 30d gains for ALL universe stocks in parallel (fast_info path)
    print(f"[pre-rocket] fetching 30d gains for {len(sym_themes)} symbols…")
    peer_gains: dict[str, float] = {}
    with ThreadPoolExecutor(max_workers=16) as pool:
        fut_map = {pool.submit(_fetch_30d_gain, s): s for s in sym_themes}
        for fut in as_completed(fut_map, timeout=60):
            s = fut_map[fut]
            try:
                g = fut.result()
                if g is not None:
                    peer_gains[s] = g
            except Exception:
                pass

    # Step 3: Filter out already-rocketed stocks
    candidates = {s: t for s, t in sym_themes.items()
                  if peer_gains.get(s, 0) < max_gain_filter}
    print(f"[pre-rocket] {len(candidates)} candidates after excluding already-rocketed stocks")

    # Step 4: Full analysis on candidates
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        fut_map2 = {
            pool.submit(_analyze_symbol, s, t, peer_gains): s
            for s, t in candidates.items()
        }
        for fut in as_completed(fut_map2, timeout=120):
            try:
                r = fut.result()
                if r and r['preRocketScore'] >= 2:
                    results.append(r)
            except Exception:
                pass

    results.sort(key=lambda x: x['preRocketScore'], reverse=True)

    by_horizon: dict[str, list] = {'15d': [], '30d': [], '60d': [], '60d+': []}
    for r in results:
        by_horizon.setdefault(r['horizon'], []).append(r)

    return {
        'candidates':  results,
        'byHorizon':   by_horizon,
        'total':       len(results),
        'themes':      list(THEME_UNIVERSE.keys()),
        'alreadyRan':  {s: round(g, 1) for s, g in peer_gains.items() if g >= max_gain_filter},
        'scannedAt':   pd.Timestamp.now().isoformat(),
    }