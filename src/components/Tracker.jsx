import { useState, useEffect } from 'react'
import { getQuotes } from '../api/yahooFinance.js'
import { fmtPrice, fmtPct } from '../utils/helpers.js'

export default function Tracker({ onAnalyze }) {
  const [tracked, setTracked] = useState(() => JSON.parse(localStorage.getItem('tracked_tickers') || '[]'))
  const [input, setInput] = useState('')
  const [quotes, setQuotes] = useState({})

  useEffect(() => {
    if (tracked.length) {
      getQuotes(tracked).then(q => setQuotes(q || {}))
    }
  }, [tracked])

  function addTracker() {
    const sym = input.trim().toUpperCase()
    if (!sym || tracked.includes(sym)) {
      setInput('')
      return
    }
    const next = [...tracked, sym]
    setTracked(next)
    localStorage.setItem('tracked_tickers', JSON.stringify(next))
    setInput('')
  }

  function removeTracker(sym) {
    const next = tracked.filter(t => t !== sym)
    setTracked(next)
    localStorage.setItem('tracked_tickers', JSON.stringify(next))
    setQuotes(q => { const n = {...q}; delete n[sym]; return n })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ── Add tracker row ────────────────────────────────– */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && addTracker()}
          placeholder="Track ticker..."
          style={{ flex: 1, maxWidth: 200 }}
        />
        <button className="btn btn-primary" onClick={addTracker}>Track</button>
      </div>

      {/* ── Tracked list ───────────────────────────────────– */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
        {tracked.map(sym => {
          const q = quotes[sym]
          if (!q) return <div key={sym} style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)' }}>Loading {sym}...</div>
          return (
            <div
              key={sym}
              onClick={() => onAnalyze(sym)}
              style={{
                padding: '12px',
                background: 'var(--bg-secondary)',
                border: '0.5px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)',
                cursor: 'pointer',
                transition: 'all var(--dur) var(--ease)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <strong style={{ fontSize: '14px' }}>{sym}</strong>
                <span onClick={(e) => { e.stopPropagation(); removeTracker(sym) }} style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }}>✕</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 500 }}>
                {fmtPrice(q.regularMarketPrice)}
              </div>
              <div style={{ color: q.regularMarketChangePercent >= 0 ? 'var(--green-text)' : 'var(--red-text)', fontSize: '12px' }}>
                {fmtPct(q.regularMarketChangePercent)}
              </div>
            </div>
          )
        })}
      </div>

      {tracked.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
          No tracked tickers yet. Add one above!
        </div>
      )}
    </div>
  )
}

