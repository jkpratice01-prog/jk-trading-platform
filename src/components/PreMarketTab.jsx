import { useState, useEffect } from 'react'
import { backendPremarket } from '../api/backend.js'

function GapBadge({ pct }) {
  const up = pct > 0
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 600,
      fontFamily: 'var(--font-mono)',
      background: up ? 'var(--green-dim)' : 'var(--red-dim)',
      color: up ? 'var(--green-text)' : 'var(--red-text)',
    }}>
      {pct > 0 ? '+' : ''}{pct?.toFixed(2)}%
    </span>
  )
}

function MoverTable({ rows, onAnalyze }) {
  if (!rows.length) return <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '8px 0' }}>No movers</div>
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Name</th>
          <th>Pre-Mkt</th>
          <th>Prev Close</th>
          <th>Gap</th>
          <th>Gap $</th>
          <th>Volume</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.symbol}>
            <td><strong style={{ color: r.gapPct > 0 ? 'var(--green-text)' : 'var(--red-text)' }}>{r.symbol}</strong></td>
            <td style={{ fontSize: 10, color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.shortName}</td>
            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>${r.prePrice?.toFixed(2)}</td>
            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>${r.prevClose?.toFixed(2)}</td>
            <td><GapBadge pct={r.gapPct} /></td>
            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: r.gapAmt > 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
              {r.gapAmt > 0 ? '+' : ''}${r.gapAmt?.toFixed(2)}
            </td>
            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
              {r.volume > 0 ? (r.volume >= 1e6 ? (r.volume / 1e6).toFixed(1) + 'M' : r.volume >= 1e3 ? (r.volume / 1e3).toFixed(0) + 'K' : r.volume) : '—'}
            </td>
            <td>
              <button className="btn" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => onAnalyze(r.symbol)}>
                Analyze
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function PreMarketTab({ onAnalyze }) {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [lastScan,  setLastScan]  = useState(null)
  const [showBoth,  setShowBoth]  = useState(true)

  async function runScan() {
    setLoading(true)
    setError(null)
    try {
      const d = await backendPremarket(30)
      setData(d)
      setLastScan(new Date().toLocaleTimeString())
    } catch (e) {
      setError('Backend not available — start server with: cd server && uvicorn main:app --reload')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runScan() }, [])

  const gapUps   = data?.gapUps   || []
  const gapDowns = data?.gapDowns || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Pre-Market Gap Scanner</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Largest gaps vs prior close · {data?.total || 0} movers found
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={runScan} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? <><span className="spinner" style={{ marginRight: 4 }} />Scanning...</> : '▶ Scan Now'}
          </button>
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showBoth} onChange={e => setShowBoth(e.target.checked)} />
            Show both gap ups & downs
          </label>
          {lastScan && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Last scan: {lastScan}</span>}
          {error && (
            <div style={{ fontSize: 11, color: 'var(--red-text)', padding: '4px 8px', background: 'var(--red-dim)', borderRadius: 'var(--r-md)' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {data && (
        <>
          {/* Gap Ups */}
          <div className="card">
            <div className="panel-hd">
              <span className="panel-title" style={{ color: 'var(--green-text)' }}>
                Gap Ups ({gapUps.length})
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Opened above prior close</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <MoverTable rows={gapUps} onAnalyze={onAnalyze} />
            </div>
          </div>

          {/* Gap Downs */}
          {showBoth && (
            <div className="card">
              <div className="panel-hd">
                <span className="panel-title" style={{ color: 'var(--red-text)' }}>
                  Gap Downs ({gapDowns.length})
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Opened below prior close</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <MoverTable rows={gapDowns} onAnalyze={onAnalyze} />
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
          Click Scan Now to find pre-market gap movers
        </div>
      )}
    </div>
  )
}
