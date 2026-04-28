"""Earnings IV analysis — historical IV expansion/crush and expected move vs actual."""
import yfinance as yf
import numpy as np
import pandas as pd
from datetime import datetime, date


def get_earnings_iv_analysis(symbol: str) -> dict:
    sym = symbol.upper()
    t   = yf.Ticker(sym)

    try:
        exps  = list(t.options)
        info  = t.info
        price = float(info.get('regularMarketPrice') or info.get('currentPrice') or 0)
        if not price:
            price = float(t.fast_info.last_price or 0)
    except Exception:
        return {'error': f'Could not fetch options for {sym}'}

    if not exps or not price:
        return {'error': 'No options data available'}

    # ATM IV per expiry
    iv_by_expiry = []
    for exp in exps[:6]:
        try:
            chain = t.option_chain(exp)
            dte   = max(1, (date.fromisoformat(exp) - date.today()).days)
            calls = chain.calls.copy(); calls['dist'] = abs(calls['strike'] - price)
            puts  = chain.puts.copy();  puts['dist']  = abs(puts['strike']  - price)
            atm_call = calls.nsmallest(1,'dist').iloc[0] if not calls.empty else None
            atm_put  = puts.nsmallest(1,'dist').iloc[0]  if not puts.empty  else None
            call_iv  = float(atm_call['impliedVolatility']) if atm_call is not None else None
            put_iv   = float(atm_put['impliedVolatility'])  if atm_put  is not None else None
            avg_iv   = np.nanmean([v for v in [call_iv, put_iv] if v])
            if avg_iv:
                exp_move = round(price * avg_iv * np.sqrt(dte / 365), 2)
                iv_by_expiry.append({
                    'expiry': exp, 'daysToExpiry': dte,
                    'atmIV':  round(avg_iv * 100, 1),
                    'callIV': round(call_iv * 100, 1) if call_iv else None,
                    'putIV':  round(put_iv  * 100, 1) if put_iv  else None,
                    'expectedMove': exp_move,
                    'expectedMovePct': round(exp_move / price * 100, 2),
                })
        except Exception:
            pass

    # Historical moves around earnings
    historical_moves = []
    try:
        hist = t.history(period='2y', interval='1d')
        ed   = t.earnings_dates
        if ed is not None and not hist.empty:
            hist.index = hist.index.tz_localize(None) if hist.index.tzinfo else hist.index
            ed.index   = ed.index.tz_localize(None)   if ed.index.tzinfo   else ed.index
            for earn_date in ed[ed.index < pd.Timestamp.now()].head(8).index:
                try:
                    ed_ts = pd.Timestamp(earn_date)
                    prior = hist[hist.index < ed_ts].iloc[-1]  if len(hist[hist.index < ed_ts]) else None
                    after = hist[hist.index >= ed_ts].iloc[0]  if len(hist[hist.index >= ed_ts]) else None
                    if prior is not None and after is not None:
                        gap = (float(after['Open']) - float(prior['Close'])) / float(prior['Close']) * 100
                        historical_moves.append({'date': str(earn_date)[:10], 'movePct': round(gap,2), 'direction': 'up' if gap > 0 else 'down'})
                except Exception:
                    pass
    except Exception:
        pass

    moves     = [abs(m['movePct']) for m in historical_moves]
    avg_move  = round(float(np.mean(moves)), 2)  if moves else None
    max_move  = round(float(np.max(moves)), 2)   if moves else None
    beat_rate = round(sum(1 for m in historical_moves if m['movePct'] > 0) / len(historical_moves) * 100, 0) if historical_moves else None

    next_earnings = None
    try:
        ed = t.earnings_dates
        if ed is not None and not ed.empty:
            now    = pd.Timestamp.now(tz='UTC') if ed.index.tzinfo else pd.Timestamp.now()
            future = ed[ed.index > now]
            if not future.empty:
                next_dt  = future.index[-1]
                eps_est  = future.iloc[-1].get('EPS Estimate')
                next_earnings = {
                    'date':        str(next_dt)[:10],
                    'daysAway':    (next_dt.date() - date.today()).days if hasattr(next_dt, 'date') else None,
                    'epsEstimate': round(float(eps_est), 2) if eps_est and str(eps_est) != 'nan' else None,
                }
    except Exception:
        pass

    return {
        'symbol': sym, 'currentPrice': round(price, 2),
        'ivByExpiry': iv_by_expiry, 'historicalMoves': historical_moves,
        'avgHistoricalMove': avg_move, 'maxHistoricalMove': max_move,
        'beatRate': beat_rate, 'nextEarnings': next_earnings,
    }
