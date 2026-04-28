import { useState, useEffect } from 'react'
import { backendPivots } from '../api/backend.js'

const LEVEL_META = [
  { key: 'r3', label: 'R3', color: '#ef4444' },
  { key: 'r2', label: 'R2', color: '#f97316' },
  { key: 'r1', label: 'R1', color: '#fbbf24' },
  { key: 'pp', label: 'PP', color: '#3b82f6' },
  { key: 's1', label: 'S1', color: '#86efac' },
  { key: 's2', label: 'S2', color: '#22c55e' },
  { key: 's3', label: 'S3', color: '#16a34a' },
]

export default function PivotLevels({ symbol, currentPrice }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [tf,      setTf]      = useState('daily')   // daily | weekly | monthly

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    backendPivots(symbol)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) return <div style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: 8 }}><span className="spinner" style={{ marginRight: 4 }} />Loading pivots…</div>
  if (!data) return null

  const levels = data[tf]
  if (!levels) return <div style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: 4 }}>No {tf} pivot data</div>

  const price = currentPrice || 0

  // Distance from current price to each level
  function distPct(lvl) {
    if (!price) return null
    return ((lvl - price) / price * 100).toFixed(2)
  }

  // Find nearest level for highlighting
  const nearestDist = Math.min(...LEVEL_META.map(m => Math.abs(levels[m.key] - price)))

  return (
    <div>
      {/* Timeframe selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {['daily','weekly','monthly'].map(t => (
          <button key={t}
            className={`btn${tf === t ? ' btn-primary' : ''}`}
            onClick={() => setTf(t)}
            style={{ fontSize: 10, padding: '2px 8px', textTransform: 'capitalize' }}
          >
            {t}
          </button>
        ))}
        {levels.date && (
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', alignSelf: 'center', marginLeft: 4 }}>
            from {levels.date}
          </span>
        )}
      </div>

      {/* Level table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: 9, color: 'var(--text-tertiary)', padding: '2px 4px', fontWeight: 500 }}>Level</th>
            <th style={{ textAlign: 'right', fontSize: 9, color: 'var(--text-tertiary)', padding: '2px 4px', fontWeight: 500 }}>Price</th>
            <th style={{ textAlign: 'right', fontSize: 9, color: 'var(--text-tertiary)', padding: '2px 4px', fontWeight: 500 }}>Dist %</th>
            <th style={{ padding: '2px 4px' }}></th>
          </tr>
        </thead>
        <tbody>
          {LEVEL_META.map(({ key, label, color }) => {
            const val  = levels[key]
            const dist = distPct(val)
            const isNearest = price && Math.abs(val - price) === nearestDist
            const above  = val > price
            return (
              <tr key={key} style={{ background: isNearest ? 'var(--bg-tertiary)' : 'transparent' }}>
                <td style={{ padding: '3px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 1.5, background: color, flexShrink: 0 }} />
                  <span style={{ fontWeight: key === 'pp' ? 700 : 500, color: key === 'pp' ? 'var(--blue)' : 'var(--text-primary)' }}>{label}</span>
                  {isNearest && <span style={{ fontSize: 8, color: 'var(--amber-text)' }}>◀ nearest</span>}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', padding: '3px 4px', fontWeight: key === 'pp' ? 700 : 400 }}>
                  ${val}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', padding: '3px 4px', fontSize: 10,
                  color: dist == null ? 'var(--text-tertiary)' : above ? 'var(--red-text)' : 'var(--green-text)' }}>
                  {dist != null ? `${above ? '+' : ''}${dist}%` : '—'}
                </td>
                <td style={{ padding: '3px 4px', width: 60 }}>
                  {/* Mini bar showing proximity */}
                  {price > 0 && (
                    <div style={{ height: 3, borderRadius: 1.5, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 1.5, background: color,
                        width: `${Math.max(4, 100 - Math.abs(parseFloat(dist)) * 10)}%`,
                        transition: 'width .3s',
                      }} />
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Current price marker */}
      {price > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 2, background: 'var(--amber)' }} />
          <span style={{ color: 'var(--text-tertiary)' }}>Current: </span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber-text)', fontWeight: 600 }}>${price}</span>
        </div>
      )}
    </div>
  )
}
