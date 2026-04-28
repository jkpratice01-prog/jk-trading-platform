import { useState, useEffect, Fragment } from 'react'
import { backendJournal, backendAddJournalEntry, backendCloseJournalTrade, backendDeleteJournalEntry } from '../api/backend.js'

const EMPTY_FORM = {
  symbol: '', side: 'buy', qty: '', entry_price: '', exit_price: '',
  entry_time: new Date().toISOString().slice(0, 16), exit_time: '', notes: '', tags: '',
}

function PnlCell({ pnl, pnl_pct }) {
  if (pnl == null) return <span style={{ color: 'var(--text-tertiary)' }}>Open</span>
  const color = pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)'
  return (
    <span style={{ fontFamily: 'var(--font-mono)', color, fontWeight: 500 }}>
      {pnl >= 0 ? '+' : ''}${pnl?.toFixed(2)} ({pnl_pct >= 0 ? '+' : ''}{pnl_pct?.toFixed(2)}%)
    </span>
  )
}

export default function TradeJournal({ onAnalyze }) {
  const [trades,    setTrades]    = useState([])
  const [loading,   setLoading]   = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [closeId,   setCloseId]   = useState(null)   // id of trade being closed
  const [closePrice,setClosePrice]= useState('')
  const [filter,    setFilter]    = useState('all')  // 'all' | 'open' | 'closed'
  const [error,     setError]     = useState(null)

  async function load() {
    setLoading(true)
    try {
      const d = await backendJournal(200)
      setTrades(d.trades || [])
    } catch {
      setError('Could not load journal — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function addTrade() {
    if (!form.symbol || !form.qty || !form.entry_price) return
    setSaving(true)
    try {
      await backendAddJournalEntry({
        symbol:      form.symbol.toUpperCase(),
        side:        form.side,
        qty:         Number(form.qty),
        entry_price: Number(form.entry_price),
        exit_price:  form.exit_price ? Number(form.exit_price) : null,
        entry_time:  form.entry_time,
        exit_time:   form.exit_time || null,
        notes:       form.notes || null,
        tags:        form.tags || null,
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      load()
    } catch (e) {
      setError('Failed to save trade')
    } finally {
      setSaving(false)
    }
  }

  async function closeTrade(id) {
    if (!closePrice) return
    try {
      await backendCloseJournalTrade(id, Number(closePrice))
      setCloseId(null)
      setClosePrice('')
      load()
    } catch {
      setError('Failed to close trade')
    }
  }

  async function deleteTrade(id) {
    if (!confirm('Delete this journal entry?')) return
    try {
      await backendDeleteJournalEntry(id)
      load()
    } catch {
      setError('Failed to delete')
    }
  }

  const visible = trades.filter(t => filter === 'all' || t.status === filter)

  // Stats
  const closed = trades.filter(t => t.status === 'closed')
  const totalPnl  = closed.reduce((s, t) => s + (t.pnl || 0), 0)
  const winners   = closed.filter(t => (t.pnl || 0) > 0)
  const winRate   = closed.length ? Math.round(winners.length / closed.length * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Stats bar */}
      {closed.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? 'var(--green-text)' : 'var(--red-text)' },
              { label: 'Win Rate',  value: `${winRate}%`, color: winRate >= 50 ? 'var(--green-text)' : 'var(--red-text)' },
              { label: 'Winners',  value: `${winners.length}`, color: 'var(--green-text)' },
              { label: 'Losers',   value: `${closed.length - winners.length}`, color: 'var(--red-text)' },
              { label: 'Open',     value: `${trades.filter(t => t.status === 'open').length}`, color: 'var(--amber-text)' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Trade Journal</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{trades.length} entries</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setShowForm(f => !f)} style={{ fontSize: 11 }}>
            {showForm ? '✕ Cancel' : '+ Log Trade'}
          </button>
          {['all','open','closed'].map(f => (
            <button key={f} className={`btn${filter === f ? ' btn-primary' : ''}`} onClick={() => setFilter(f)} style={{ fontSize: 11, textTransform: 'capitalize' }}>
              {f}
            </button>
          ))}
          <button className="btn" onClick={load} style={{ fontSize: 11 }}>↺ Refresh</button>
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)' }}>{error}</div>}
      </div>

      {/* Add trade form */}
      {showForm && (
        <div className="card">
          <div className="panel-title" style={{ marginBottom: 10 }}>Log New Trade</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            {[
              { key: 'symbol',      label: 'Symbol',      type: 'text',     placeholder: 'AAPL' },
              { key: 'side',        label: 'Side',        type: 'select',   opts: ['buy','sell'] },
              { key: 'qty',         label: 'Qty',         type: 'number',   placeholder: '10' },
              { key: 'entry_price', label: 'Entry Price', type: 'number',   placeholder: '180.50' },
              { key: 'exit_price',  label: 'Exit Price',  type: 'number',   placeholder: 'Optional' },
              { key: 'entry_time',  label: 'Entry Time',  type: 'datetime-local' },
              { key: 'exit_time',   label: 'Exit Time',   type: 'datetime-local' },
              { key: 'tags',        label: 'Tags',        type: 'text',     placeholder: 'scalp, breakout' },
            ].map(({ key, label, type, placeholder, opts }) => (
              <label key={key} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {label}
                {type === 'select' ? (
                  <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ fontSize: 11 }}>
                    {opts.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                  </select>
                ) : (
                  <input type={type} value={form[key]} placeholder={placeholder}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ fontSize: 11 }}
                  />
                )}
              </label>
            ))}
          </div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
            Notes
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Setup, thesis, mistakes..." style={{ fontSize: 11, resize: 'vertical' }} />
          </label>
          <button className="btn btn-primary" onClick={addTrade} disabled={saving} style={{ fontSize: 11, marginTop: 10 }}>
            {saving ? 'Saving...' : 'Save Trade'}
          </button>
        </div>
      )}

      {/* Trades table */}
      {visible.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>P&L</th>
                  <th>Date</th>
                  <th>Tags</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(t => (
                  <Fragment key={t.id}>
                    <tr>
                      <td>
                        <strong style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => onAnalyze && onAnalyze(t.symbol)}>
                          {t.symbol}
                        </strong>
                      </td>
                      <td>
                        <span className={`badge ${t.side === 'buy' ? 'badge-up' : 'badge-dn'}`} style={{ fontSize: 9 }}>
                          {t.side.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{t.qty}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>${t.entry_price?.toFixed(2)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {t.exit_price ? `$${t.exit_price.toFixed(2)}` : '—'}
                      </td>
                      <td><PnlCell pnl={t.pnl} pnl_pct={t.pnl_pct} /></td>
                      <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t.entry_time?.slice(0, 16)}</td>
                      <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t.tags || '—'}</td>
                      <td style={{ fontSize: 10, color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.notes || '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {t.status === 'open' && (
                            <button className="btn" style={{ fontSize: 9, padding: '2px 5px' }} onClick={() => setCloseId(t.id)}>
                              Close
                            </button>
                          )}
                          <button className="btn" style={{ fontSize: 9, padding: '2px 5px', color: 'var(--red-text)' }} onClick={() => deleteTrade(t.id)}>
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                    {closeId === t.id && (
                      <tr>
                        <td colSpan={10} style={{ padding: '8px 12px', background: 'var(--bg-secondary)' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 11 }}>Exit price:</span>
                            <input type="number" value={closePrice} onChange={e => setClosePrice(e.target.value)}
                              placeholder="0.00" style={{ width: 80, fontSize: 11 }} />
                            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => closeTrade(t.id)}>
                              Confirm Close
                            </button>
                            <button className="btn" style={{ fontSize: 11 }} onClick={() => setCloseId(null)}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>No trades logged yet</div>
          <div style={{ fontSize: 11 }}>Click "+ Log Trade" to add your first entry</div>
        </div>
      )}
    </div>
  )
}
