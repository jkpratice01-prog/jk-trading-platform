import { useState, useEffect } from 'react'
import { backendQuotes } from '../api/backend.js'
import { fmtPrice, fmtPct } from '../utils/helpers.js'

export default function Tracker({ onAnalyze }) {
  const [tracked, setTracked] = useState(() => JSON.parse(localStorage.getItem('tracked_tickers') || '[]'))
  const [input,   setInput]   = useState('')
  const [quotes,  setQuotes]  = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (tracked.length) loadQuotes(tracked)
  }, [tracked.join(',')])

  async function loadQuotes(syms) {
    setLoading(true)
    try {
      const q = await backendQuotes(syms)
      setQuotes(prev => ({ ...prev, ...q }))
    } catch {}
    finally { setLoading(false) }
  }

  function addTracker() {
    const sym = input.trim().toUpperCase()
    if (!sym || tracked.includes(sym)) { setInput(''); return }
    const next = [...tracked, sym]
    setTracked(next)
    localStorage.setItem('tracked_tickers', JSON.stringify(next))
    setInput('')
  }

  function removeTracker(sym) {
    const next = tracked.filter(t => t !== sym)
    setTracked(next)
    localStorage.setItem('tracked_tickers', JSON.stringify(next))
    setQuotes(q => { const n = { ...q }; delete n[sym]; return n })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Watchlist Tracker</span>
          {loading && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Refreshing…</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addTracker()}
            placeholder="Add ticker (Enter)…"
            style={{ flex: 1, maxWidth: 220 }}
          />
          <button className="btn btn-primary" onClick={addTracker} style={{ fontSize: 11 }}>Track</button>
          <button className="btn" onClick={() => loadQuotes(tracked)} disabled={loading || !tracked.length} style={{ fontSize: 11 }}>↺</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {tracked.map(sym => {
          const q  = quotes[sym]
          const up = (q?.regularMarketChangePercent ?? 0) >= 0
          return (
            <div key={sym} onClick={() => onAnalyze(sym)} style={{
              padding: 12, background: 'var(--bg-secondary)',
              border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--r-md)',
              cursor: 'pointer', transition: 'background var(--dur) var(--ease)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{sym}</strong>
                <span onClick={e => { e.stopPropagation(); removeTracker(sym) }}
                  style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 11 }}>✕</span>
              </div>
              {q ? (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 500 }}>
                    {fmtPrice(q.regularMarketPrice)}
                  </div>
                  <div style={{ fontSize: 12, color: up ? 'var(--green-text)' : 'var(--red-text)', marginTop: 2 }}>
                    {fmtPct(q.regularMarketChangePercent)}
                  </div>
                  {q.regularMarketVolume && (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      Vol {(q.regularMarketVolume / 1e6).toFixed(1)}M
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {loading ? 'Loading…' : 'No data'}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {tracked.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)', fontSize: 12 }}>
          Add tickers above to track them. Click any card to open in Analyzer.
        </div>
      )}
    </div>
  )
}
