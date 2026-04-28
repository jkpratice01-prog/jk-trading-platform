import { useState, useEffect } from 'react'
import { backendVolSkew } from '../api/backend.js'

export default function VolatilitySkew({ symbol, expiry }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    backendVolSkew(symbol, expiry)
      .then(setData)
      .catch(() => setError('Failed to load skew data'))
      .finally(() => setLoading(false))
  }, [symbol, expiry])

  if (loading) return (
    <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
      <span className="spinner" style={{ marginRight: 4 }} />Loading skew...
    </div>
  )
  if (error) return <div style={{ fontSize: 11, color: 'var(--red-text)', padding: 8 }}>{error}</div>
  if (!data?.skew?.length) return <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: 8 }}>No skew data available</div>

  const rows   = data.skew
  const spot   = data.underlyingPrice
  const W = 560
  const H = 160
  const PAD = { t: 10, r: 20, b: 30, l: 40 }
  const chartW = W - PAD.l - PAD.r
  const chartH = H - PAD.t - PAD.b

  // Determine x range: ±15% from spot, filtered
  const xMin = spot ? spot * 0.85 : Math.min(...rows.map(r => r.strike))
  const xMax = spot ? spot * 1.15 : Math.max(...rows.map(r => r.strike))
  const visible = rows.filter(r => r.strike >= xMin && r.strike <= xMax)

  if (!visible.length) return <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: 8 }}>No strikes in ±15% range</div>

  const allIVs = [
    ...visible.map(r => r.callIV).filter(Boolean),
    ...visible.map(r => r.putIV).filter(Boolean),
  ]
  const yMin = Math.max(0, Math.min(...allIVs) * 0.9)
  const yMax = Math.max(...allIVs) * 1.1

  function xPx(strike) {
    return PAD.l + ((strike - xMin) / (xMax - xMin)) * chartW
  }
  function yPx(iv) {
    return PAD.t + chartH - ((iv - yMin) / (yMax - yMin)) * chartH
  }

  // Build SVG polyline points
  const callPoints = visible
    .filter(r => r.callIV != null)
    .map(r => `${xPx(r.strike)},${yPx(r.callIV)}`)
    .join(' ')
  const putPoints = visible
    .filter(r => r.putIV != null)
    .map(r => `${xPx(r.strike)},${yPx(r.putIV)}`)
    .join(' ')

  // Y-axis labels
  const yTicks = 4
  const yStep  = (yMax - yMin) / yTicks

  // Spot line
  const spotX = spot ? xPx(spot) : null

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6, display: 'flex', gap: 12 }}>
        <span style={{ color: 'var(--green-text)' }}>— Calls</span>
        <span style={{ color: 'var(--red-text)' }}>— Puts</span>
        {spot && <span>Spot ${spot.toFixed(2)}</span>}
        {data.expiry && <span>Expiry {data.expiry}</span>}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', maxWidth: W }}>
        {/* Grid lines */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const iv  = yMin + i * yStep
          const y   = yPx(iv)
          return (
            <g key={i}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border-subtle)" strokeWidth={0.5} />
              <text x={PAD.l - 4} y={y + 3} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">
                {(iv * 100).toFixed(0)}%
              </text>
            </g>
          )
        })}

        {/* Spot price line */}
        {spotX && (
          <line x1={spotX} y1={PAD.t} x2={spotX} y2={H - PAD.b} stroke="var(--amber)" strokeWidth={1} strokeDasharray="4,3" />
        )}

        {/* Call IV line */}
        {callPoints && (
          <polyline points={callPoints} fill="none" stroke="#22c55e" strokeWidth={1.5} />
        )}

        {/* Put IV line */}
        {putPoints && (
          <polyline points={putPoints} fill="none" stroke="#ef4444" strokeWidth={1.5} />
        )}

        {/* X-axis labels (every ~5 visible strikes) */}
        {visible.filter((_, i) => i % Math.ceil(visible.length / 6) === 0).map(r => (
          <text key={r.strike} x={xPx(r.strike)} y={H - PAD.b + 12} textAnchor="middle" fontSize={8} fill="var(--text-tertiary)">
            ${r.strike}
          </text>
        ))}
      </svg>
    </div>
  )
}
