import { useState, useEffect, useRef, useCallback } from 'react'
import { backendQuotes } from '../api/backend.js'

const STORAGE_KEY = 'price_alerts_v2'
const POLL_MS     = 30_000

function load()    { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
function persist(a){ localStorage.setItem(STORAGE_KEY, JSON.stringify(a)) }

function timeStr() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

const ALERT_TYPES = [
  { value: 'above',      label: 'Price above'    },
  { value: 'below',      label: 'Price below'    },
  { value: 'pct_up',     label: '% gain from now'},
  { value: 'pct_down',   label: '% drop from now'},
  { value: 'vol_spike',  label: 'Volume spike ×' },
]

function typeDesc(a) {
  if (a.type === 'above')     return `above $${a.value}`
  if (a.type === 'below')     return `below $${a.value}`
  if (a.type === 'pct_up')    return `+${a.value}% from $${a.refPrice?.toFixed(2)}`
  if (a.type === 'pct_down')  return `−${a.value}% from $${a.refPrice?.toFixed(2)}`
  if (a.type === 'vol_spike') return `volume ≥ ${a.value}× avg`
  return ''
}

function typeIcon(a) {
  if (a.type === 'above' || a.type === 'pct_up')   return '↑'
  if (a.type === 'below' || a.type === 'pct_down')  return '↓'
  if (a.type === 'vol_spike')                       return '⚡'
  return '●'
}

function typeColor(a) {
  if (a.type === 'above' || a.type === 'pct_up')   return 'var(--green-text)'
  if (a.type === 'below' || a.type === 'pct_down')  return 'var(--red-text)'
  return 'var(--amber-text)'
}

function checkAlert(alert, q) {
  const price = q.regularMarketPrice
  const vol   = q.regularMarketVolume  || 0
  const avg   = q.averageDailyVolume10Day || 1

  if (alert.type === 'above')     return price >= alert.value
  if (alert.type === 'below')     return price <= alert.value
  if (alert.type === 'pct_up')    return alert.refPrice && price >= alert.refPrice * (1 + alert.value / 100)
  if (alert.type === 'pct_down')  return alert.refPrice && price <= alert.refPrice * (1 - alert.value / 100)
  if (alert.type === 'vol_spike') return vol >= avg * alert.value
  return false
}

function Badge({ text, color, bg }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
      color, background: bg || color + '22',
    }}>{text}</span>
  )
}

export default function AlertsTab({ onAnalyze }) {
  const [alerts,   setAlerts]   = useState(load)
  const [tab,      setTab]      = useState('active')   // active | history

  // Form state
  const [sym,      setSym]      = useState('')
  const [aType,    setAType]    = useState('above')
  const [value,    setValue]    = useState('')
  const [adding,   setAdding]   = useState(false)

  const [history,  setHistory]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('alerts_history_v1') || '[]') } catch { return [] }
  })
  const [lastCheck, setLastCheck] = useState(null)
  const [countdown, setCountdown] = useState(30)

  const timerRef    = useRef(null)
  const cdRef       = useRef(null)

  const pushHistory = useCallback((entry) => {
    setHistory(h => {
      const next = [entry, ...h].slice(0, 50)
      localStorage.setItem('alerts_history_v1', JSON.stringify(next))
      return next
    })
  }, [])

  const fireAlert = useCallback((alert, currentPrice, extra = '') => {
    const msg = `${alert.symbol} ${typeDesc(alert)} — now ${extra || '$' + currentPrice?.toFixed(2)}`
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🔔 Alert: ${alert.symbol}`, { body: msg })
    }
    pushHistory({ ...alert, currentPrice, firedAt: timeStr(), msg, firedDate: new Date().toLocaleDateString() })
  }, [pushHistory])

  const checkAll = useCallback(async () => {
    const active = load().filter(a => !a.triggered)
    if (!active.length) return
    const syms = [...new Set(active.map(a => a.symbol))]
    try {
      const quotes = await backendQuotes(syms)
      const updated = load()
      let changed = false
      updated.forEach(a => {
        if (a.triggered) return
        const q = quotes[a.symbol]
        if (!q?.regularMarketPrice) return
        if (checkAlert(a, q)) {
          fireAlert(a, q.regularMarketPrice)
          a.triggered = true
          changed = true
        }
      })
      if (changed) { persist(updated); setAlerts([...updated]) }
    } catch {}
    setLastCheck(timeStr())
    setCountdown(30)
  }, [fireAlert])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    timerRef.current = setInterval(checkAll, POLL_MS)
    cdRef.current    = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => { clearInterval(timerRef.current); clearInterval(cdRef.current) }
  }, [checkAll])

  async function addAlert() {
    const s = sym.trim().toUpperCase()
    const v = parseFloat(value)
    if (!s || isNaN(v) || v <= 0) return
    setAdding(true)
    let refPrice = null
    try {
      if (aType === 'pct_up' || aType === 'pct_down') {
        const q = await backendQuotes([s])
        refPrice = q[s]?.regularMarketPrice || null
      }
    } catch {}
    setAdding(false)
    const alert = {
      id: Date.now(), symbol: s, type: aType, value: v,
      refPrice, triggered: false, createdAt: timeStr(),
    }
    const next = [...load(), alert]
    persist(next); setAlerts(next)
    setSym(''); setValue('')
  }

  function remove(id) {
    const next = load().filter(a => a.id !== id)
    persist(next); setAlerts(next)
  }

  function clearTriggered() {
    const next = load().filter(a => !a.triggered)
    persist(next); setAlerts(next)
  }

  function clearHistory() {
    localStorage.removeItem('alerts_history_v1')
    setHistory([])
  }

  const active    = alerts.filter(a => !a.triggered)
  const triggered = alerts.filter(a =>  a.triggered)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">🔔 Price Alerts</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {active.length} active · checked every 30s
            </span>
            {lastCheck && (
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                · next in {countdown}s
              </span>
            )}
            <button className="btn btn-primary" onClick={checkAll} style={{ fontSize: 10, padding: '3px 8px' }}>
              Check now
            </button>
          </div>
        </div>

        {Notification.permission !== 'granted' && (
          <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--amber-text)', padding: '6px 10px', background: 'var(--amber-dim)', borderRadius: 6 }}>
            ⚠ Enable browser notifications to receive alert pop-ups when this tab is in the background.
            <button
              onClick={() => Notification.requestPermission()}
              style={{ marginLeft: 10, fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: 'var(--amber-text)', color: '#000', border: 'none' }}
            >
              Enable
            </button>
          </div>
        )}

        {/* Add alert form */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 6, alignItems: 'center' }}>
          <input
            value={sym}
            onChange={e => setSym(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addAlert()}
            placeholder="Ticker"
            style={{ width: 72, fontSize: 12, padding: '5px 8px' }}
          />
          <select
            value={aType}
            onChange={e => setAType(e.target.value)}
            style={{ fontSize: 11, padding: '5px 8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}
          >
            {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addAlert()}
            placeholder={aType === 'vol_spike' ? '2.0×' : aType.startsWith('pct') ? '5.0' : '$0.00'}
            style={{ width: 80, fontSize: 12, padding: '5px 8px' }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {aType === 'vol_spike' ? '× avg vol' : aType.startsWith('pct') ? '%' : ''}
          </span>
          <button
            className="btn btn-primary"
            onClick={addAlert}
            disabled={adding}
            style={{ fontSize: 11, padding: '5px 12px', whiteSpace: 'nowrap' }}
          >
            {adding ? '…' : '+ Add Alert'}
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Alert types:</strong>
          {' '}Price above/below a level · % gain/drop from <em>current</em> price (fetched when added) · Volume spike × avg
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '0.5px solid var(--border-subtle)' }}>
        {[
          { id: 'active',  label: `Active (${active.length})`       },
          { id: 'fired',   label: `Triggered (${triggered.length})` },
          { id: 'history', label: `History (${history.length})`     },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontSize: 11, padding: '7px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: tab === t.id ? 600 : 400,
              borderBottom: tab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active alerts */}
      {tab === 'active' && (
        <div className="card" style={{ padding: 0 }}>
          {active.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔔</div>
              <div style={{ fontSize: 13 }}>No active alerts</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Add an alert using the form above</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Condition</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {active.map(a => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 13, color: typeColor(a) }}>{typeIcon(a)} {a.symbol}</strong>
                        {onAnalyze && (
                          <button className="btn" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => onAnalyze(a.symbol)}>
                            Chart
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{typeDesc(a)}</td>
                    <td style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{a.createdAt}</td>
                    <td>
                      <button
                        onClick={() => remove(a.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 14, padding: '0 4px' }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Triggered alerts */}
      {tab === 'fired' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {triggered.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={clearTriggered} style={{ fontSize: 10 }}>
                Clear triggered
              </button>
            </div>
          )}
          {triggered.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: 13 }}>No triggered alerts</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Symbol</th><th>Condition</th><th>Created</th><th></th></tr>
                </thead>
                <tbody>
                  {triggered.map(a => (
                    <tr key={a.id} style={{ opacity: 0.6 }}>
                      <td><strong style={{ color: typeColor(a) }}>{typeIcon(a)} {a.symbol}</strong></td>
                      <td style={{ fontSize: 11 }}>{typeDesc(a)}</td>
                      <td style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{a.createdAt}</td>
                      <td>
                        <button onClick={() => remove(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 14 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={clearHistory} style={{ fontSize: 10 }}>Clear history</button>
            </div>
          )}
          {history.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: 13 }}>No alert history yet</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Symbol</th><th>Message</th><th>Fired</th></tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td>
                        <strong style={{ color: typeColor(h), fontSize: 13 }}>{typeIcon(h)} {h.symbol}</strong>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{h.msg}</td>
                      <td style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                        {h.firedDate} {h.firedAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
