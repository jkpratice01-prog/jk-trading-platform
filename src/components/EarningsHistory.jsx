import { useState, useEffect } from 'react'
import { backendEarningsHistory } from '../api/backend.js'

function MoveBar({ move }) {
  if (move == null) return <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>—</span>
  const capped = Math.max(-20, Math.min(20, move))
  const color  = move >= 0 ? 'var(--green-text)' : 'var(--red-text)'
  const width  = Math.abs(capped) * 3  // max 60px at ±20%
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 60, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          [move >= 0 ? 'left' : 'right']: '50%',
          width: `${width / 2}px`,
          height: '100%',
          background: color,
          borderRadius: 3,
        }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border-subtle)' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color, minWidth: 40 }}>
        {move >= 0 ? '+' : ''}{move.toFixed(1)}%
      </span>
    </div>
  )
}

export default function EarningsHistory({ symbol }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true); setData(null); setError(null)
    backendEarningsHistory(symbol)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load earnings history'); setLoading(false) })
  }, [symbol])

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 12 }}>Loading earnings history…</div>
  if (error)   return <div style={{ padding: 20, color: 'var(--red-text)', fontSize: 12 }}>{error}</div>
  if (!data?.history?.length) return <div style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 12 }}>No earnings history available for {symbol}</div>

  const { history, summary } = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Beat Rate',    value: `${summary.beatRate}%`, color: summary.beatRate >= 75 ? 'var(--green-text)' : summary.beatRate < 50 ? 'var(--red-text)' : 'var(--amber-text)', sub: `${summary.beats}/${summary.totalQuarters} quarters` },
          { label: 'Avg Move',     value: `±${summary.avgMove}%`, color: 'var(--amber-text)', sub: 'on earnings day' },
          { label: 'Avg Up Move',  value: `+${summary.avgUpMove}%`, color: 'var(--green-text)', sub: 'when beat' },
          { label: 'Avg Down Move',value: `${summary.avgDownMove}%`, color: 'var(--red-text)', sub: 'when missed' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ padding: '8px 14px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '0.5px solid var(--border-subtle)', minWidth: 100 }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* History table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Quarter</th>
                <th>Date</th>
                <th>EPS Est.</th>
                <th>EPS Actual</th>
                <th>Surprise</th>
                <th>Beat / Miss</th>
                <th>Stock Move</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.quarter}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{row.date}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {row.epsEstimate != null ? `$${row.epsEstimate}` : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                    color: row.beat === true ? 'var(--green-text)' : row.beat === false ? 'var(--red-text)' : 'var(--text-primary)' }}>
                    {row.epsActual != null ? `$${row.epsActual}` : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                    color: row.surprise > 0 ? 'var(--green-text)' : row.surprise < 0 ? 'var(--red-text)' : 'var(--text-primary)' }}>
                    {row.surprise != null ? `${row.surprise > 0 ? '+' : ''}${row.surprise}%` : '—'}
                  </td>
                  <td>
                    {row.beat === true  && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'var(--green-dim)', color: 'var(--green-text)' }}>✓ BEAT</span>}
                    {row.beat === false && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'var(--red-dim)', color: 'var(--red-text)' }}>✗ MISS</span>}
                    {row.beat === null  && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>—</span>}
                  </td>
                  <td><MoveBar move={row.stockMove} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
        Stock move = % change on the trading day of/after the earnings announcement. Beat/Miss based on EPS estimate vs actual.
      </div>
    </div>
  )
}
