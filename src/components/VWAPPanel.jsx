import { useState, useEffect, useRef, useCallback } from 'react'
import { backendVWAP } from '../api/backend.js'

function Sparkline({ values, color, height = 80 }) {
  if (!values || values.length < 2) return null
  const W = 400, H = height
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => [
    4 + (i / (values.length - 1)) * (W - 8),
    4 + (1 - (v - min) / range) * (H - 8),
  ])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export default function VWAPPanel({ symbol }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true); setError(null); setData(null)
    backendVWAP(symbol)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [symbol])

  if (loading) return (
    <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', fontSize: 11, color: 'var(--text-tertiary)' }}>
      <span className="spinner" style={{ marginRight: 6 }} />Loading VWAP...
    </div>
  )

  if (error || !data) return (
    <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', fontSize: 11, color: 'var(--text-tertiary)' }}>
      VWAP unavailable — requires market hours intraday data
    </div>
  )

  const { currentPrice, currentVWAP, deviationPct, signal, close: closes, vwap, timestamps } = data
  const dev = deviationPct || 0
  const devColor = dev > 1 ? '#22c55e' : dev < -1 ? '#ef4444' : 'var(--amber-text)'
  const labels = (timestamps || []).map(t => {
    const d = new Date(typeof t === 'number' ? t * 1000 : t)
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
  })

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', border: '0.5px solid var(--border-subtle)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>VWAP — {symbol}</span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>5-min intraday</span>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
        {[
          { label: 'Price',     val: `$${currentPrice?.toFixed(2) ?? '—'}`, color: 'var(--text-primary)' },
          { label: 'VWAP',      val: `$${currentVWAP?.toFixed(2)  ?? '—'}`, color: 'var(--blue)'         },
          { label: 'vs VWAP',   val: `${dev >= 0 ? '+' : ''}${dev?.toFixed(2)}%`, color: devColor        },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Signal */}
      <div style={{
        padding: '5px 10px', borderRadius: 'var(--r-md)', marginBottom: 10, fontSize: 11, fontWeight: 500,
        background: dev > 1 ? 'var(--green-dim)' : dev < -1 ? 'var(--red-dim)' : 'var(--bg-tertiary)',
        color: dev > 1 ? 'var(--green-text)' : dev < -1 ? 'var(--red-text)' : 'var(--text-secondary)',
      }}>
        {dev > 2  && '↑↑ Extended above VWAP — potential mean-reversion zone (short/fade setup)'}
        {dev > 0.5 && dev <= 2  && '↑ Above VWAP — bullish bias, support on pullback to VWAP'}
        {Math.abs(dev) <= 0.5   && '→ At VWAP — neutral, watching for direction'}
        {dev < -0.5 && dev >= -2 && '↓ Below VWAP — bearish bias, resistance at VWAP'}
        {dev < -2  && '↓↓ Extended below VWAP — potential bounce / mean-reversion zone'}
      </div>

      {/* Dual sparklines — price and VWAP */}
      <div style={{ position: 'relative' }}>
        <svg viewBox="0 0 400 90" style={{ width: '100%', height: 90, display: 'block' }}>
          <defs>
            <linearGradient id="vwap-price-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={dev >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0.15"/>
              <stop offset="100%" stopColor={dev >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0.01"/>
            </linearGradient>
          </defs>
          {/* Render price + VWAP as SVG paths */}
          {(() => {
            const all = [...(closes || []), ...(vwap || [])]
            const W = 400, H = 90, pad = { t: 6, b: 18, l: 4, r: 4 }
            const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b
            const mn = Math.min(...all), mx = Math.max(...all)
            const rng = mx - mn || 1
            const xOf = i => pad.l + (i / Math.max((closes||[]).length - 1, 1)) * iW
            const yOf = v => pad.t + (1 - (v - mn) / rng) * iH
            const pricePts = (closes||[]).map((v,i) => [xOf(i), yOf(v)])
            const vwapPts  = (vwap||[]).map((v,i)  => [xOf(i), yOf(v)])
            const priceLine = pricePts.map((p,i)=>`${i===0?'M':'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
            const vwapLine  = vwapPts.map((p,i) =>`${i===0?'M':'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
            return (
              <>
                <path d={priceLine} fill="none" stroke={dev >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.5" strokeLinejoin="round" />
                <path d={vwapLine}  fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="4,2" />
                {/* X labels */}
                {labels.filter((_, i) => i % Math.ceil(labels.length / 5) === 0).map((lbl, j, arr) => {
                  const origIdx = labels.indexOf(lbl)
                  return <text key={j} x={xOf(origIdx)} y={H-2} textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.4">{lbl}</text>
                })}
              </>
            )
          })()}
        </svg>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
          <span style={{ color: dev >= 0 ? '#22c55e' : '#ef4444' }}>— Price</span>
          <span style={{ color: '#3b82f6' }}>— — VWAP</span>
        </div>
      </div>
    </div>
  )
}
