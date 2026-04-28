import { useState, useEffect, useRef, useCallback } from 'react'
import { backendQuotes } from '../api/backend.js'

const STORAGE_KEY = 'price_alerts_v1'
const POLL_MS     = 30_000  // 30 seconds

function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveAlerts(alerts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
}

export default function PriceAlerts() {
  const [alerts,    setAlerts]    = useState(loadAlerts)
  const [sym,       setSym]       = useState('')
  const [price,     setPrice]     = useState('')
  const [dir,       setDir]       = useState('above')
  const [show,      setShow]      = useState(false)
  const [fired,     setFired]     = useState([])
  const timerRef = useRef(null)

  // Request notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const fire = useCallback((alert, currentPrice) => {
    const msg = `${alert.symbol} ${alert.direction === 'above' ? '↑' : '↓'} $${alert.price} — now $${currentPrice.toFixed(2)}`
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Price Alert: ${alert.symbol}`, { body: msg, icon: '/favicon.ico' })
    }
    setFired(f => [{ ...alert, currentPrice, firedAt: new Date().toLocaleTimeString(), msg }, ...f.slice(0, 9)])
  }, [])

  const checkAlerts = useCallback(async () => {
    const active = loadAlerts().filter(a => !a.triggered)
    if (!active.length) return
    const syms = [...new Set(active.map(a => a.symbol))]
    try {
      const quotes = await backendQuotes(syms)
      const updated = loadAlerts()
      let changed = false
      updated.forEach(a => {
        if (a.triggered) return
        const q = quotes[a.symbol]
        if (!q?.regularMarketPrice) return
        const p = q.regularMarketPrice
        const crossed = (a.direction === 'above' && p >= a.price) || (a.direction === 'below' && p <= a.price)
        if (crossed) { fire(a, p); a.triggered = true; changed = true }
      })
      if (changed) { saveAlerts(updated); setAlerts([...updated]) }
    } catch {}
  }, [fire])

  useEffect(() => {
    timerRef.current = setInterval(checkAlerts, POLL_MS)
    return () => clearInterval(timerRef.current)
  }, [checkAlerts])

  function addAlert() {
    const s = sym.trim().toUpperCase(), p = parseFloat(price)
    if (!s || isNaN(p) || p <= 0) return
    const alert = { id: Date.now(), symbol: s, price: p, direction: dir, triggered: false, createdAt: new Date().toLocaleTimeString() }
    const next = [...loadAlerts(), alert]
    saveAlerts(next); setAlerts(next)
    setSym(''); setPrice('')
  }

  function removeAlert(id) {
    const next = loadAlerts().filter(a => a.id !== id)
    saveAlerts(next); setAlerts(next)
  }

  function clearTriggered() {
    const next = loadAlerts().filter(a => !a.triggered)
    saveAlerts(next); setAlerts(next)
    setFired([])
  }

  const active    = alerts.filter(a => !a.triggered)
  const triggered = alerts.filter(a => a.triggered)

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        className={`btn ${active.length ? 'btn-primary' : ''}`}
        style={{ fontSize: 11, padding: '4px 10px', position: 'relative' }}
        onClick={() => setShow(s => !s)}
        title="Price Alerts"
      >
        🔔 {active.length > 0 && <span style={{ fontSize: 9, fontWeight: 700 }}>{active.length}</span>}
      </button>

      {/* Fired flash */}
      {fired.length > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6, width: 14, height: 14,
          borderRadius: '50%', background: '#ef4444', border: '2px solid var(--bg-primary)',
          fontSize: 8, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
        }}>{fired.length}</span>
      )}

      {/* Dropdown panel */}
      {show && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
          background: 'var(--bg-secondary)', border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--r-lg)', padding: 12, width: 320,
          boxShadow: '0 8px 24px #0004',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Price Alerts</div>

          {/* Add alert form */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            <input value={sym} onChange={e => setSym(e.target.value.toUpperCase())}
              placeholder="Ticker" style={{ width: 70, fontSize: 11 }} />
            <select value={dir} onChange={e => setDir(e.target.value)} style={{ fontSize: 11, padding: '3px 6px' }}>
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)}
              placeholder="$0.00" style={{ width: 72, fontSize: 11 }} />
            <button className="btn btn-primary" onClick={addAlert} style={{ fontSize: 11, padding: '3px 10px' }}>+ Add</button>
          </div>

          {/* Active alerts */}
          {active.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Active ({active.length}) — checked every 30s
              </div>
              {active.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 11 }}>
                    <strong>{a.symbol}</strong> {a.direction === 'above' ? '↑ above' : '↓ below'} <strong style={{ fontFamily: 'var(--font-mono)' }}>${a.price}</strong>
                  </span>
                  <button onClick={() => removeAlert(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Recent fired */}
          {fired.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: 'var(--red-text)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Triggered
              </div>
              {fired.slice(0, 3).map((f, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '2px 0' }}>
                  {f.firedAt} — {f.msg}
                </div>
              ))}
            </div>
          )}

          {(triggered.length > 0 || fired.length > 0) && (
            <button className="btn" onClick={clearTriggered} style={{ fontSize: 10, width: '100%' }}>
              Clear triggered
            </button>
          )}

          {active.length === 0 && fired.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: '8px 0' }}>
              No alerts set — add one above
            </div>
          )}

          {Notification.permission !== 'granted' && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--amber-text)', background: 'var(--amber-dim)', borderRadius: 4, padding: '4px 8px' }}>
              ⚠ Enable browser notifications for alerts
            </div>
          )}
        </div>
      )}
    </div>
  )
}
