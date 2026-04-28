import { useState, useEffect } from 'react'
import {
  backendTradingAccount, backendTradingPositions, backendTradingOrders,
  backendPlaceOrder, backendCancelOrder, backendClosePosition
} from '../api/backend.js'

function StatBox({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

function fmtMoney(n) {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const EMPTY_ORDER = { symbol: '', qty: '1', side: 'buy', type: 'market', limit: '' }

export default function TradingTab({ onAnalyze }) {
  const [account,   setAccount]   = useState(null)
  const [positions, setPositions] = useState([])
  const [orders,    setOrders]    = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [form,      setForm]      = useState(EMPTY_ORDER)
  const [placing,   setPlacing]   = useState(false)
  const [orderTab,  setOrderTab]  = useState('positions')  // positions | orders | place

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [acct, pos, ord] = await Promise.all([
        backendTradingAccount(),
        backendTradingPositions(),
        backendTradingOrders('all'),
      ])
      if (acct?.error) {
        setError(acct.error)
      } else {
        setAccount(acct)
        setPositions(pos?.positions || [])
        setOrders(ord?.orders || [])
      }
    } catch (e) {
      setError('Backend not available — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function placeOrder() {
    if (!form.symbol || !form.qty) return
    setPlacing(true)
    try {
      await backendPlaceOrder(
        form.symbol, Number(form.qty), form.side, form.type,
        form.type === 'limit' ? Number(form.limit) : null
      )
      setForm(EMPTY_ORDER)
      setTimeout(loadAll, 1000)
    } catch (e) {
      setError('Order failed: ' + e.message)
    } finally {
      setPlacing(false)
    }
  }

  async function cancelOrder(id) {
    try {
      await backendCancelOrder(id)
      loadAll()
    } catch (e) {
      setError('Cancel failed: ' + e.message)
    }
  }

  async function closePos(symbol) {
    if (!confirm(`Close entire ${symbol} position?`)) return
    try {
      await backendClosePosition(symbol)
      setTimeout(loadAll, 1000)
    } catch (e) {
      setError('Close failed: ' + e.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Account summary */}
      {account && !account.error && (
        <div className="card">
          <div className="panel-hd">
            <span className="panel-title">Paper Account</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {account.status} · {account.patternDayTrader ? 'PDT' : 'Non-PDT'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <StatBox label="Portfolio Value" value={fmtMoney(account.portfolioValue)} />
            <StatBox label="Cash"            value={fmtMoney(account.cash)} />
            <StatBox label="Buying Power"    value={fmtMoney(account.buyingPower)} color="var(--blue)" />
            <StatBox label="Long Mkt Value"  value={fmtMoney(account.longMarketValue)} />
          </div>
        </div>
      )}

      {/* Tab controls */}
      <div className="card">
        <div className="panel-hd">
          <div style={{ display: 'flex', gap: 4 }}>
            {[['positions','Positions'],['orders','Orders'],['place','Place Order']].map(([id, label]) => (
              <button key={id} className={`btn${orderTab === id ? ' btn-primary' : ''}`}
                onClick={() => setOrderTab(id)} style={{ fontSize: 11 }}>
                {label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={loadAll} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? <span className="spinner" /> : '↺ Refresh'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 'var(--r-md)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Positions */}
      {orderTab === 'positions' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {positions.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
              No open positions
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Avg Entry</th>
                  <th>Current</th>
                  <th>Mkt Value</th>
                  <th>Unreal P&L</th>
                  <th>P&L %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.symbol}>
                    <td>
                      <strong style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => onAnalyze?.(p.symbol)}>
                        {p.symbol}
                      </strong>
                    </td>
                    <td>
                      <span className={`badge ${p.side === 'long' ? 'badge-up' : 'badge-dn'}`} style={{ fontSize: 9 }}>
                        {p.side.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.qty}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>${p.avgEntryPrice?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>${p.currentPrice?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{fmtMoney(p.marketValue)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: p.unrealizedPL >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
                      {p.unrealizedPL >= 0 ? '+' : ''}{fmtMoney(p.unrealizedPL)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: p.unrealizedPLPct >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
                      {p.unrealizedPLPct >= 0 ? '+' : ''}{p.unrealizedPLPct?.toFixed(2)}%
                    </td>
                    <td>
                      <button className="btn" style={{ fontSize: 9, padding: '2px 5px', color: 'var(--red-text)' }}
                        onClick={() => closePos(p.symbol)}>
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Orders */}
      {orderTab === 'orders' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {orders.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
              No orders found
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Type</th>
                  <th>Limit</th>
                  <th>Filled</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td>
                      <strong style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => onAnalyze?.(o.symbol)}>
                        {o.symbol}
                      </strong>
                    </td>
                    <td>
                      <span className={`badge ${o.side === 'buy' ? 'badge-up' : 'badge-dn'}`} style={{ fontSize: 9 }}>
                        {o.side.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{o.qty}</td>
                    <td style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{o.type}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      {o.limitPrice ? `$${o.limitPrice.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      {o.filledAvgPrice ? `$${o.filledAvgPrice.toFixed(2)} (${o.filledQty})` : '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, color:
                        o.status === 'filled' ? 'var(--green-text)' :
                        o.status === 'canceled' ? 'var(--red-text)' :
                        o.status === 'new' ? 'var(--amber-text)' : 'var(--text-secondary)'
                      }}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{o.createdAt?.slice(0, 16)}</td>
                    <td>
                      {(o.status === 'new' || o.status === 'partially_filled') && (
                        <button className="btn" style={{ fontSize: 9, padding: '2px 5px', color: 'var(--red-text)' }}
                          onClick={() => cancelOrder(o.id)}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Place order */}
      {orderTab === 'place' && (
        <div className="card">
          <div className="panel-title" style={{ marginBottom: 12 }}>Place Paper Order</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            {[
              { key: 'symbol', label: 'Symbol', type: 'text', placeholder: 'AAPL' },
              { key: 'qty',    label: 'Quantity', type: 'number', placeholder: '10' },
            ].map(({ key, label, type, placeholder }) => (
              <label key={key} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {label}
                <input type={type} value={form[key]} placeholder={placeholder}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ fontSize: 11 }}
                />
              </label>
            ))}
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              Side
              <select value={form.side} onChange={e => setForm(f => ({ ...f, side: e.target.value }))} style={{ fontSize: 11 }}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              Order Type
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ fontSize: 11 }}>
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </label>
            {form.type === 'limit' && (
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                Limit Price
                <input type="number" value={form.limit} placeholder="180.00"
                  onChange={e => setForm(f => ({ ...f, limit: e.target.value }))}
                  style={{ fontSize: 11 }}
                />
              </label>
            )}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              className={`btn ${form.side === 'buy' ? 'btn-primary' : ''}`}
              style={{ fontSize: 12, padding: '6px 18px', background: form.side === 'buy' ? 'var(--green)' : undefined, color: form.side === 'buy' ? 'white' : undefined }}
              onClick={placeOrder}
              disabled={placing}
            >
              {placing ? 'Placing...' : form.side === 'buy' ? 'Buy' : 'Sell'} {form.symbol || '—'} × {form.qty || '0'}
            </button>
            <button className="btn" onClick={() => setForm(EMPTY_ORDER)} style={{ fontSize: 11 }}>Reset</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
            Paper trading only — no real money involved
          </div>
        </div>
      )}
    </div>
  )
}
