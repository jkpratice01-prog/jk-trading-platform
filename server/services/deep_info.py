"""
Deep stock info for the Analyzer panel.

Returns fundamentals, key price levels, short interest, analyst targets,
and earnings expected move — all from a single yfinance.info call.
"""
import math
import pandas as pd
from datetime import datetime
from server.services.yf_session import ticker as yf_ticker


def get_deep_info(symbol: str) -> dict:
    try:
        t = yf_ticker(symbol.upper())
        info = t.info or {}

        def _f(key):
            v = info.get(key)
            return None if v in (None, 'N/A', 'None', float('inf'), float('-inf')) else v

        result = {
            'symbol': symbol.upper(),
            # ── Key price levels ─────────────────────────────
            'week52High':        _f('fiftyTwoWeekHigh'),
            'week52Low':         _f('fiftyTwoWeekLow'),
            'fiftyDayAvg':       _f('fiftyDayAverage'),
            'twoHundredDayAvg':  _f('twoHundredDayAverage'),
            'beta':              _f('beta'),
            # ── Short interest ───────────────────────────────
            'shortFloat':        _f('shortPercentOfFloat'),   # 0–1
            'shortRatio':        _f('shortRatio'),
            'sharesShort':       _f('sharesShort'),
            # ── Analyst ─────────────────────────────────────
            'targetMeanPrice':          _f('targetMeanPrice'),
            'targetHighPrice':          _f('targetHighPrice'),
            'targetLowPrice':           _f('targetLowPrice'),
            'recommendationKey':        _f('recommendationKey'),
            'numberOfAnalystOpinions':  _f('numberOfAnalystOpinions'),
            # ── Fundamentals ─────────────────────────────────
            'trailingEps':      _f('trailingEps'),
            'forwardEps':       _f('forwardEps'),
            'forwardPE':        _f('forwardPE'),
            'pegRatio':         _f('pegRatio'),
            'revenueGrowth':    _f('revenueGrowth'),
            'earningsGrowth':   _f('earningsGrowth'),
            'profitMargins':    _f('profitMargins'),
            'grossMargins':     _f('grossMargins'),
            'operatingMargins': _f('operatingMargins'),
            'debtToEquity':     _f('debtToEquity'),
            'returnOnEquity':   _f('returnOnEquity'),
            'priceToBook':      _f('priceToBook'),
            # ── Ownership ────────────────────────────────────
            'heldPercentInstitutions': _f('heldPercentInstitutions'),
            'heldPercentInsiders':     _f('heldPercentInsiders'),
            'floatShares':             _f('floatShares'),
            'fetchedAt': datetime.utcnow().isoformat(),
        }

        # ── Earnings date + expected move ────────────────────
        try:
            now = pd.Timestamp.now(tz='UTC')
            ed  = t.earnings_dates
            if ed is not None and not ed.empty:
                future = ed[ed.index > now]
                if not future.empty:
                    earnings_dt  = future.index[-1]
                    days_to_earn = max(1, (earnings_dt.date() - now.date()).days)
                    result['nextEarningsDate'] = earnings_dt.strftime('%Y-%m-%d')
                    result['daysToEarnings']   = days_to_earn

                    # Expected move from ATM IV × √(DTE/365)
                    current_price = _f('regularMarketPrice') or _f('currentPrice')
                    exps = t.options
                    if exps and current_price:
                        post = [e for e in exps if pd.Timestamp(e).date() >= earnings_dt.date()]
                        target_exp = post[0] if post else exps[0]
                        chain = t.option_chain(target_exp)
                        if not chain.calls.empty:
                            calls = chain.calls.copy()
                            calls['_d'] = abs(calls['strike'] - current_price)
                            atm_iv = float(calls.nsmallest(3, '_d')['impliedVolatility'].mean())
                            # Sanity: IV must be realistic (5%–300%)
                            if atm_iv and 0.05 < atm_iv < 3.0:
                                move_pct = atm_iv * math.sqrt(days_to_earn / 365) * 100
                                # Further sanity: expected move should be 1%–60%
                                if 1.0 <= move_pct <= 60.0:
                                    result['expectedMovePct'] = round(move_pct, 1)
                                    result['expectedMoveUsd'] = round(current_price * move_pct / 100, 2)
                                    result['earningsExpiry']  = target_exp
        except Exception:
            pass

        return result
    except Exception as e:
        return {'symbol': symbol.upper(), 'error': str(e)}
