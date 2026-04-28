"""Alpaca paper trading — account, positions, orders."""
try:
    from alpaca.trading.client import TradingClient
    from alpaca.trading.requests import MarketOrderRequest, LimitOrderRequest, GetOrdersRequest
    from alpaca.trading.enums import OrderSide, TimeInForce, QueryOrderStatus
    HAS_ALPACA = True
except ImportError:
    HAS_ALPACA = False


def _client(api_key: str, secret_key: str):
    if not HAS_ALPACA or not api_key or not secret_key:
        return None
    try:
        return TradingClient(api_key, secret_key, paper=True)
    except Exception:
        return None


def get_account(api_key: str, secret_key: str) -> dict:
    c = _client(api_key, secret_key)
    if not c:
        return {'error': 'Alpaca not configured — add ALPACA_API_KEY to server/.env'}
    try:
        a = c.get_account()
        return {
            'buyingPower': float(a.buying_power or 0), 'cash': float(a.cash or 0),
            'portfolioValue': float(a.portfolio_value or 0), 'equity': float(a.equity or 0),
            'longMarketValue': float(a.long_market_value or 0),
            'shortMarketValue': float(a.short_market_value or 0),
            'status': a.status.value, 'tradingBlocked': bool(a.trading_blocked),
            'patternDayTrader': bool(a.pattern_day_trader),
        }
    except Exception as e:
        return {'error': str(e)}


def get_positions(api_key: str, secret_key: str) -> list:
    c = _client(api_key, secret_key)
    if not c:
        return []
    try:
        return [{
            'symbol': p.symbol, 'qty': float(p.qty), 'side': p.side.value,
            'avgEntryPrice': float(p.avg_entry_price),
            'currentPrice': float(p.current_price or 0),
            'marketValue': float(p.market_value or 0),
            'unrealizedPL': float(p.unrealized_pl or 0),
            'unrealizedPLPct': round(float(p.unrealized_plpc or 0)*100, 2),
            'costBasis': float(p.cost_basis or 0),
            'changeToday': float(p.change_today or 0),
        } for p in c.get_all_positions()]
    except Exception:
        return []


def get_orders(api_key: str, secret_key: str, status: str = 'all') -> list:
    c = _client(api_key, secret_key)
    if not c:
        return []
    try:
        qs  = QueryOrderStatus.ALL if status == 'all' else QueryOrderStatus.OPEN
        req = GetOrdersRequest(status=qs, limit=50)
        return [{
            'id': str(o.id), 'symbol': o.symbol, 'qty': float(o.qty or 0),
            'side': o.side.value, 'type': o.type.value, 'status': o.status.value,
            'limitPrice': float(o.limit_price) if o.limit_price else None,
            'filledAvgPrice': float(o.filled_avg_price) if o.filled_avg_price else None,
            'filledQty': float(o.filled_qty or 0),
            'createdAt': str(o.created_at)[:19],
            'submittedAt': str(o.submitted_at)[:19] if o.submitted_at else None,
        } for o in c.get_orders(filter=req)]
    except Exception:
        return []


def place_order(api_key, secret_key, symbol, qty, side, order_type='market', limit_price=None):
    c = _client(api_key, secret_key)
    if not c:
        return {'error': 'Alpaca not configured'}
    try:
        s = OrderSide.BUY if side.lower() == 'buy' else OrderSide.SELL
        if order_type == 'market':
            req = MarketOrderRequest(symbol=symbol.upper(), qty=qty, side=s, time_in_force=TimeInForce.DAY)
        else:
            req = LimitOrderRequest(symbol=symbol.upper(), qty=qty, side=s,
                                    time_in_force=TimeInForce.DAY, limit_price=limit_price)
        o = c.submit_order(order_data=req)
        return {'id': str(o.id), 'symbol': o.symbol, 'qty': float(o.qty or 0),
                'side': o.side.value, 'status': o.status.value, 'createdAt': str(o.created_at)[:19]}
    except Exception as e:
        return {'error': str(e)}


def cancel_order(api_key, secret_key, order_id):
    c = _client(api_key, secret_key)
    if not c:
        return {'error': 'Alpaca not configured'}
    try:
        c.cancel_order_by_id(order_id)
        return {'ok': True}
    except Exception as e:
        return {'error': str(e)}


def close_position(api_key, secret_key, symbol):
    c = _client(api_key, secret_key)
    if not c:
        return {'error': 'Alpaca not configured'}
    try:
        c.close_position(symbol.upper())
        return {'ok': True}
    except Exception as e:
        return {'error': str(e)}
