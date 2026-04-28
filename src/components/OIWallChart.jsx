import { useState, useEffect } from 'react'
import { backendOIWall } from '../api/backend.js'

function fmtK(n) {
  if (!n) return '0'
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M'
  if (n >= 1e3) return (n/1e3).toFixed(0)+'K'
  return String(n)
}

export default function OIWallChart({ symbol, expiry, underlyingPrice, maxPain }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    backendOIWall(symbol, expiry)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [symbol, expiry])

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)', fontSize: 11 }}>
      <span className="spinner" style={{ marginRight: 6 }} />Loading OI wall...
    </div>
  )

  const wall = data?.wall || []
  if (!wall.length) return (
    <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-tertiary)', fontSize: 11 }}>
      No OI data — fetch the chain first.
    </div>
  )

  // Focus on strikes within ±20% of current price
  const lo = underlyingPrice ? underlyingPrice * 0.80 : 0
  const hi = underlyingPrice ? underlyingPrice * 1.20 : Infinity
  const visible = wall.filter(w => w.strike >= lo && w.strike <= hi)
  if (!visible.length) return null

  const maxOI = Math.max(...visible.map(w => Math.max(w.callOI, w.putOI)), 1)
  const BAR_MAX = 140  // max bar width px

  const totalCallOI = visible.reduce((s, w) => s + w.callOI, 0)
  const totalPutOI  = visible.reduce((s, w) => s + w.putOI,  0)
  const pcRatio     = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : '—'

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 11 }}>
        <span style={{ color: 'var(--green-text)', fontWeight: 600 }}>
          Calls OI: {fmtK(totalCallOI)}
        </span>
        <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>
          Puts OI: {fmtK(totalPutOI)}
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>P/C OI: {pcRatio}</span>
        {maxPain && (
          <span style={{ color: 'var(--amber-text)', fontWeight: 600, marginLeft: 'auto' }}>
            Max Pain: ${maxPain}
          </span>
        )}
      </div>

      {/* Wall chart — puts left, strikes centre, calls right */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: `${BAR_MAX}px 70px ${BAR_MAX}px`, gap: 4, marginBottom: 4 }}>
          <div style={{ textAlign: 'right', fontSize: 9, color: 'var(--red-text)', fontWeight: 600 }}>PUTS OI</div>
          <div style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-tertiary)' }}>STRIKE</div>
          <div style={{ textAlign: 'left', fontSize: 9, color: 'var(--green-text)', fontWeight: 600 }}>CALLS OI</div>
        </div>

        {[...visible].reverse().map(w => {
          const callW = (w.callOI / maxOI) * BAR_MAX
          const putW  = (w.putOI  / maxOI) * BAR_MAX
          const isATM = underlyingPrice && Math.abs(w.strike - underlyingPrice) / underlyingPrice < 0.01
          const isMaxPain = maxPain && w.strike === maxPain
          const isHov = hovered === w.strike

          return (
            <div key={w.strike}
              onMouseEnter={() => setHovered(w.strike)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'grid',
                gridTemplateColumns: `${BAR_MAX}px 70px ${BAR_MAX}px`,
                gap: 4, alignItems: 'center',
                background: isATM ? 'var(--blue)11' : isMaxPain ? 'var(--amber-dim)' : isHov ? 'var(--bg-hover)' : 'transparent',
                borderRadius: 3, padding: '1px 0',
                borderLeft: isATM ? '2px solid var(--blue)' : isMaxPain ? '2px solid var(--amber)' : '2px solid transparent',
              }}
            >
              {/* Put bar — right-aligned */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                {isHov && <span style={{ fontSize: 9, color: 'var(--red-text)', fontFamily: 'var(--font-mono)' }}>{fmtK(w.putOI)}</span>}
                <div style={{ width: putW, height: 14, background: '#ef4444cc', borderRadius: '2px 0 0 2px' }} />
              </div>

              {/* Strike label */}
              <div style={{
                textAlign: 'center', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: isATM || isMaxPain ? 700 : 400,
                color: isATM ? 'var(--blue)' : isMaxPain ? 'var(--amber-text)' : 'var(--text-secondary)',
              }}>
                ${w.strike}
                {isATM && <span style={{ fontSize: 8, color: 'var(--blue)', marginLeft: 2 }}>●</span>}
                {isMaxPain && <span style={{ fontSize: 8, color: 'var(--amber)', marginLeft: 2 }}>⚑</span>}
              </div>

              {/* Call bar — left-aligned */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: callW, height: 14, background: '#22c55ecc', borderRadius: '0 2px 2px 0' }} />
                {isHov && <span style={{ fontSize: 9, color: 'var(--green-text)', fontFamily: 'var(--font-mono)' }}>{fmtK(w.callOI)}</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-tertiary)', display: 'flex', gap: 12 }}>
        <span>● = Current price</span>
        <span>⚑ = Max pain</span>
        <span>Showing ±20% from current price</span>
      </div>
    </div>
  )
}
