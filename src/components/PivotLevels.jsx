import { useState, useEffect } from 'react'
import { backendPivots } from '../api/backend.js'

const STD_LEVELS = [
  { key: 'r3', label: 'R3', color: '#ef4444', role: 'Strong resistance' },
  { key: 'r2', label: 'R2', color: '#f97316', role: 'Resistance'        },
  { key: 'r1', label: 'R1', color: '#fbbf24', role: 'Weak resistance'   },
  { key: 'pp', label: 'PP', color: '#3b82f6', role: 'Pivot point'       },
  { key: 's1', label: 'S1', color: '#86efac', role: 'Weak support'      },
  { key: 's2', label: 'S2', color: '#22c55e', role: 'Support'           },
  { key: 's3', label: 'S3', color: '#16a34a', role: 'Strong support'    },
]

function distColor(pct) {
  const n = parseFloat(pct)
  return n > 0 ? 'var(--red-text)' : 'var(--green-text)'
}

function LevelRow({ label, color, price, currentPrice, role, isNearest, tag }) {
  if (!price) return null
  const above = price > currentPrice
  const dist  = currentPrice ? (((price - currentPrice) / currentPrice) * 100).toFixed(2) : null
  return (
    <tr style={{ background: isNearest ? 'var(--bg-tertiary)' : 'transparent' }}>
      <td style={{ padding: '4px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: color, flexShrink: 0 }} />
          <span style={{ fontWeight: label === 'PP' ? 700 : 500, color: label === 'PP' ? 'var(--blue)' : 'var(--text-primary)', fontSize: 11 }}>{label}</span>
          {tag && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>{tag}</span>}
          {isNearest && <span style={{ fontSize: 8, color: 'var(--amber-text)' }}>◀</span>}
        </div>
      </td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 6px', fontWeight: label === 'PP' ? 700 : 400 }}>
        ${price}
      </td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 6px', color: dist ? distColor(dist) : 'var(--text-tertiary)' }}>
        {dist ? `${above ? '+' : ''}${dist}%` : '—'}
      </td>
      <td style={{ padding: '4px 6px', fontSize: 9, color: 'var(--text-tertiary)', maxWidth: 120 }}>{role}</td>
    </tr>
  )
}

function SectionHeader({ title }) {
  return (
    <tr>
      <td colSpan={4} style={{ padding: '8px 6px 2px', fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: '0.5px solid var(--border-subtle)' }}>
        {title}
      </td>
    </tr>
  )
}

export default function PivotLevels({ symbol, currentPrice }) {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [tf,        setTf]        = useState('daily')
  const [pivotType, setPivotType] = useState('std')  // std | fib

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    backendPivots(symbol)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) return <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: 12 }}>Loading levels…</div>
  if (!data)   return null

  const levels   = data[tf]
  const src      = levels && pivotType === 'fib' && levels.fib ? levels.fib : levels
  const price    = currentPrice || 0
  const prevDay  = data.prevDay
  const swingH   = data.swingHighs || []
  const swingL   = data.swingLows  || []

  // Nearest level across all standard levels
  const allPrices  = src ? STD_LEVELS.map(m => src[m.key]).filter(Boolean) : []
  const nearestVal = allPrices.length && price ? allPrices.reduce((a, b) => Math.abs(a - price) < Math.abs(b - price) ? a : b) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {['daily', 'weekly', 'monthly'].map(t => (
          <button key={t} className={`btn${tf === t ? ' btn-primary' : ''}`}
            onClick={() => setTf(t)} style={{ fontSize: 10, padding: '2px 8px', textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
        <div style={{ width: 1, height: 12, background: 'var(--border-subtle)', margin: '0 2px' }} />
        <button onClick={() => setPivotType(p => p === 'std' ? 'fib' : 'std')}
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: pivotType === 'fib' ? 'var(--amber-dim)' : 'var(--bg-tertiary)',
            color: pivotType === 'fib' ? 'var(--amber-text)' : 'var(--text-secondary)', fontWeight: 500 }}>
          {pivotType === 'std' ? 'Standard' : 'Fibonacci'}
        </button>
        {levels?.date && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>from {levels.date}</span>}
      </div>

      {/* ── Current price ────────────────────────────────────────────────── */}
      {price > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--amber-dim)', borderRadius: 6 }}>
          <div style={{ width: 8, height: 2, background: 'var(--amber-text)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Current price</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--amber-text)' }}>${price}</span>
        </div>
      )}

      {/* ── Main levels table ─────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Level', 'Price', 'Dist %', 'Role'].map(h => (
                <th key={h} style={{ textAlign: h === 'Level' || h === 'Role' ? 'left' : 'right', padding: '6px 6px', fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, borderBottom: '0.5px solid var(--border-subtle)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>

            {/* Previous Day Levels */}
            {prevDay && (
              <>
                <SectionHeader title="Previous Day (PDH · PDL · PDC)" />
                <LevelRow label="PDH" color="#f87171" price={prevDay.high}  currentPrice={price} role="Previous day high — key resistance" />
                <LevelRow label="PDL" color="#4ade80" price={prevDay.low}   currentPrice={price} role="Previous day low — key support" />
                <LevelRow label="PDC" color="#94a3b8" price={prevDay.close} currentPrice={price} role="Previous close — intraday reference" />
              </>
            )}

            {/* Calculated Pivot Levels */}
            {src && (
              <>
                <SectionHeader title={`${pivotType === 'fib' ? 'Fibonacci' : 'Standard'} Pivot Levels (${tf})`} />
                {STD_LEVELS.map(({ key, label, color, role }) => (
                  <LevelRow
                    key={key} label={label} color={color} price={src[key]}
                    currentPrice={price} role={role}
                    isNearest={nearestVal && src[key] === nearestVal}
                    tag={key === 'pp' ? pivotType === 'fib' ? 'Fib' : 'Std' : undefined}
                  />
                ))}
              </>
            )}

            {/* Swing Highs */}
            {swingH.length > 0 && (
              <>
                <SectionHeader title="Swing Highs (price action resistance)" />
                {swingH.map((h, i) => (
                  <LevelRow key={`sh${i}`} label={`SwH${i + 1}`} color="#f97316" price={h.price}
                    currentPrice={price} role={`Tested ${h.date}`} />
                ))}
              </>
            )}

            {/* Swing Lows */}
            {swingL.length > 0 && (
              <>
                <SectionHeader title="Swing Lows (price action support)" />
                {swingL.map((l, i) => (
                  <LevelRow key={`sl${i}`} label={`SwL${i + 1}`} color="#22c55e" price={l.price}
                    currentPrice={price} role={`Tested ${l.date}`} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.7, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
        <strong style={{ color: '#f87171' }}>PDH/PDL/PDC</strong> — previous day's high, low, close. Most watched by day traders — price often reacts at these. &nbsp;·&nbsp;
        <strong style={{ color: '#f97316' }}>Swing Highs/Lows</strong> — actual price levels that were tested in the past 60 days (more reliable than calculated pivots). &nbsp;·&nbsp;
        <strong style={{ color: '#3b82f6' }}>PP</strong> — calculated from prior period (H+L+C)/3. &nbsp;·&nbsp;
        <strong style={{ color: '#fbbf24' }}>R1-R3</strong> resistance, <strong style={{ color: '#22c55e' }}>S1-S3</strong> support.
        Fibonacci pivots use 38.2%, 61.8%, 100% extensions instead of fixed arithmetic.
      </div>
    </div>
  )
}
