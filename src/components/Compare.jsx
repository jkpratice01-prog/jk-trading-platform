import { useState, useEffect } from 'react'
import { backendQuotes } from '../api/backend.js'
import { fmtPrice, fmtPct, fmtLarge } from '../utils/helpers.js'

const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META']

export default function Compare({ onAnalyze }) {
  const [tickers, setTickers] = useState(DEFAULT_TICKERS)
  const [input,   setInput]   = useState('')
  const [quotes,  setQuotes]  = useState({})
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Load quotes on mount and whenever tickers list changes
  useEffect(() => {
    if (tickers.length) loadQuotes(tickers)
  }, [tickers.join(',')])   // stable dep — only re-run when list changes

  async function loadQuotes(syms) {
    setLoading(true)
    setError(null)
    try {
      const q = await backendQuotes(syms)
      setQuotes(prev => ({ ...prev, ...q }))
    } catch (err) {
      setError('Could not fetch quotes — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  function addTicker() {
    const sym = input.trim().toUpperCase()
    if (!sym || tickers.includes(sym)) { setInput(''); return }
    setTickers(prev => [...prev, sym])
    setInput('')
  }

  function removeTicker(sym) {
    setTickers(prev => prev.filter(t => t !== sym))
    setQuotes(prev => { const n = { ...prev }; delete n[sym]; return n })
  }

  // Normalised values for sparkline-style comparison bars
  const prices = tickers.map(s => quotes[s]?.regularMarketPrice).filter(Boolean)
  const maxPrice = prices.length ? Math.max(...prices) : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Controls */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Compare</span>
          {loading && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Loading...</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addTicker()}
            placeholder="Add ticker (Enter)..."
            style={{ flex: 1, maxWidth: 200 }}
          />
          <button className="btn btn-primary" onClick={addTicker} style={{ fontSize: 11 }}>Add</button>
          <button className="btn" onClick={() => loadQuotes(tickers)} disabled={loading} style={{ fontSize: 11 }}>
            ↺ Refresh
          </button>
          {error && <span style={{ fontSize: 11, color: 'var(--red-text)' }}>{error}</span>}
        </div>
        {/* Active tickers chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {tickers.map(sym => (
            <span key={sym} style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 20,
              background: 'var(--bg-tertiary)', border: '0.5px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => onAnalyze(sym)}>{sym}</span>
              <span style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 10 }} onClick={() => removeTicker(sym)}>✕</span>
            </span>
          ))}
        </div>
      </div>

      {/* Comparison table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Price</th>
              <th>Change %</th>
              <th>Volume</th>
              <th>Mkt Cap</th>
              <th>P/E</th>
              <th>Rel. Price</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tickers.map(sym => {
              const q = quotes[sym]
              if (!q) return (
                <tr key={sym}>
                  <td colSpan={8} style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {loading ? `Loading ${sym}...` : `No data for ${sym}`}
                  </td>
                </tr>
              )
              const pct = q.regularMarketPrice / maxPrice * 100
              const up  = (q.regularMarketChangePercent ?? 0) >= 0
              return (
                <tr key={sym} style={{ cursor: 'pointer' }} onClick={() => onAnalyze(sym)}>
                  <td><strong style={{ color: 'var(--blue)' }}>{sym}</strong>
                    {q.shortName && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 400 }}>{q.shortName}</div>}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtPrice(q.regularMarketPrice)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: up ? 'var(--green-text)' : 'var(--red-text)' }}>
                    {fmtPct(q.regularMarketChangePercent)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                    {q.regularMarketVolume ? fmtLarge(q.regularMarketVolume) : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                    {q.marketCap ? fmtLarge(q.marketCap) : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    {q.trailingPE?.toFixed(1) ?? '—'}
                  </td>
                  <td style={{ minWidth: 80 }}>
                    <div style={{ height: 5, borderRadius: 2, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: up ? 'var(--green)' : 'var(--red)', transition: 'width .3s' }} />
                    </div>
                  </td>
                  <td onClick={e => { e.stopPropagation(); removeTicker(sym) }}
                    style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 11 }}>✕</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

