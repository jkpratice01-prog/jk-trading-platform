import { useState, useEffect, useRef, useCallback } from 'react'
import { backendContractHistory } from '../api/backend.js'

// ── Full SVG line chart with axes, grid, hover tooltip ────────────────────────
function LineChart({ snapshots, field, label, fmt, color = '#4f8ef7', height = 180 }) {
  const svgRef    = useRef(null)
  const [tooltip, setTooltip] = useState(null)  // { x, y, value, time }

  const values = snapshots.map(s => s[field]).filter(v => v != null && !isNaN(v))
  const times  = snapshots.map(s => s.time_label)

  if (values.length === 0) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
      No data
    </div>
  )

  if (values.length === 1) return (
    <div style={{ height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>
        {fmt(values[0])}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
        1 snapshot · {times[0]} · more data builds as you refresh the chain
      </div>
    </div>
  )

  // Layout constants
  const W = 560, H = height
  const pad = { top: 16, right: 16, bottom: 28, left: 52 }
  const iW  = W - pad.left - pad.right
  const iH  = H - pad.top  - pad.bottom

  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || maxV * 0.02 || 0.01
  const padRange = range * 0.15
  const yMin = minV - padRange
  const yMax = maxV + padRange

  const xOf = i => pad.left + (i / Math.max(values.length - 1, 1)) * iW
  const yOf = v => pad.top  + (1 - (v - yMin) / (yMax - yMin)) * iH

  // Build path strings
  const pts  = values.map((v, i) => [xOf(i), yOf(v)])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts.at(-1)[0].toFixed(1)},${(pad.top + iH).toFixed(1)} L${pts[0][0].toFixed(1)},${(pad.top + iH).toFixed(1)} Z`

  // Y-axis ticks (4 levels)
  const yTicks = [0, 0.33, 0.67, 1].map(t => yMin + t * (yMax - yMin))

  // Trend colour: green if last > first, red otherwise
  const up     = values.at(-1) >= values[0]
  const stroke = up ? '#22c55e' : '#ef4444'
  const fillId = `fill-${field}`

  // Mouse hover: find nearest point
  const handleMouseMove = useCallback(e => {
    const svg  = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx   = (e.clientX - rect.left) / rect.width * W
    const idx  = Math.max(0, Math.min(values.length - 1,
      Math.round((mx - pad.left) / iW * (values.length - 1))
    ))
    setTooltip({
      x:     pts[idx][0],
      y:     pts[idx][1],
      value: values[idx],
      time:  times[idx] || '',
      idx,
    })
  }, [values, pts, times])

  const last  = values.at(-1)
  const first = values[0]
  const delta = last - first
  const deltaPct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0

  return (
    <div style={{ position: 'relative' }}>
      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, paddingLeft: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {fmt(last)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: up ? '#22c55e' : '#ef4444' }}>
          {delta >= 0 ? '+' : ''}{fmt(delta)} ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%)
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {values.length} snapshots · {times[0]}–{times.at(-1)}
        </span>
      </div>

      {/* SVG chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height, display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={stroke} stopOpacity="0.25" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines + Y-axis labels */}
        {yTicks.map((v, i) => {
          const y = yOf(v)
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={pad.left + iW} y2={y}
                stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="3,3" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end"
                fontSize="9" fill="currentColor" fillOpacity="0.45">
                {fmt(v)}
              </text>
            </g>
          )
        })}

        {/* Vertical grid lines at each data point */}
        {pts.map((p, i) => (
          <line key={i} x1={p[0]} y1={pad.top} x2={p[0]} y2={pad.top + iH}
            stroke="currentColor" strokeOpacity="0.05" strokeWidth="1" />
        ))}

        {/* X-axis baseline */}
        <line x1={pad.left} y1={pad.top + iH} x2={pad.left + iW} y2={pad.top + iH}
          stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />

        {/* X-axis time labels — show up to 6, evenly spaced */}
        {times.map((t, i) => {
          const step = Math.max(1, Math.floor(times.length / 6))
          if (i % step !== 0 && i !== times.length - 1) return null
          return (
            <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle"
              fontSize="9" fill="currentColor" fillOpacity="0.45">
              {t}
            </text>
          )
        })}

        {/* Filled area under line */}
        <path d={area} fill={`url(#${fillId})`} />

        {/* Line */}
        <path d={line} fill="none" stroke={stroke} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Data point dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2.5}
            fill={stroke} fillOpacity={i === pts.length - 1 ? 1 : 0.5}
            stroke="var(--bg-primary)" strokeWidth="1.5">
            <title>{times[i]}: {fmt(values[i])}</title>
          </circle>
        ))}

        {/* Hover crosshair */}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={pad.top} x2={tooltip.x} y2={pad.top + iH}
              stroke={stroke} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="3,2" />
            <circle cx={tooltip.x} cy={tooltip.y} r="5"
              fill={stroke} stroke="var(--bg-primary)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: `${(tooltip.x / W) * 100}%`,
          top: tooltip.y / H < 0.5 ? '40%' : '10%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          background: 'var(--bg-secondary)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 6, padding: '4px 8px',
          fontSize: 10, whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px #0004',
          zIndex: 10,
        }}>
          <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>{tooltip.time}</span>
          <strong style={{ color: stroke, fontFamily: 'var(--font-mono)' }}>{fmt(tooltip.value)}</strong>
        </div>
      )}
    </div>
  )
}

// ── Bar chart for volume / OI ──────────────────────────────────────────────────
function BarChart({ snapshots, field, label, color = '#4f8ef7', height = 140 }) {
  const [hovered, setHovered] = useState(null)
  const values = snapshots.map(s => s[field] ?? 0)
  const times  = snapshots.map(s => s.time_label)
  const maxV   = Math.max(...values, 1)

  if (values.length === 0) return null

  const last = values.at(-1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, paddingLeft: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {last?.toLocaleString()}
        </span>
        {values.length > 1 && (
          <span style={{ fontSize: 10, color: values.at(-1) >= values.at(-2) ? '#22c55e' : '#ef4444' }}>
            {values.at(-1) >= values.at(-2) ? '▲' : '▼'} {Math.abs(values.at(-1) - values.at(-2)).toLocaleString()}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {values.length} snapshots
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, padding: '0 2px', position: 'relative' }}>
        {values.map((v, i) => {
          const barH = Math.max(4, (v / maxV) * (height - 24))
          const isLast = i === values.length - 1
          const isHov  = hovered === i
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {isHov && (
                <div style={{
                  position: 'absolute', bottom: height - barH + 8,
                  background: 'var(--bg-secondary)', border: '0.5px solid var(--border-default)',
                  borderRadius: 5, padding: '2px 6px', fontSize: 9, whiteSpace: 'nowrap',
                  boxShadow: '0 2px 6px #0003', pointerEvents: 'none', zIndex: 10,
                }}>
                  <span style={{ color: 'var(--text-tertiary)', marginRight: 3 }}>{times[i]}</span>
                  <strong style={{ color, fontFamily: 'var(--font-mono)' }}>{v.toLocaleString()}</strong>
                </div>
              )}
              <div style={{
                width: '100%', height: barH,
                background: isLast ? color : `${color}88`,
                borderRadius: '3px 3px 0 0',
                border: isHov ? `1px solid ${color}` : 'none',
                transition: 'height 0.2s, opacity 0.15s',
              }} />
              {values.length <= 12 && (
                <span style={{ fontSize: 8, color: 'var(--text-tertiary)', transform: 'rotate(-35deg)', transformOrigin: 'center', marginTop: 2 }}>
                  {times[i]}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ContractChart({ symbol, contract, onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('price')

  useEffect(() => {
    if (!symbol || !contract?.contractSymbol) return
    setLoading(true)
    setData(null)
    // Pass expiry so the backend force-fetches fresh yfinance data and saves
    // a new DB snapshot before returning history — chart always ends at live price
    backendContractHistory(symbol, contract.contractSymbol, contract.expirationLabel)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [symbol, contract?.contractSymbol])

  const isCall   = contract?.type === 'call'
  const accent   = isCall ? '#22c55e' : '#ef4444'
  const snapshots = data?.snapshots || []

  const TABS = [
    { id: 'price',  label: 'Mid Price' },
    { id: 'iv',     label: 'IV %'      },
    { id: 'oi',     label: 'Open Interest' },
    { id: 'volume', label: 'Volume'    },
  ]

  const fmtMid  = v => `$${v?.toFixed(2) ?? '—'}`
  const fmtIV   = v => `${(v * 100)?.toFixed(1) ?? '—'}%`

  return (
    <div style={{
      background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)',
      border: `0.5px solid ${accent}55`,
      padding: '12px 14px', marginTop: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
            background: isCall ? '#22c55e22' : '#ef444422', color: accent,
          }}>
            {isCall ? 'CALL' : 'PUT'}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            {symbol} ${contract?.strike} · {contract?.expirationLabel}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Δ {contract?.delta?.toFixed(2) ?? '—'} · {contract?.daysToExpiry}d · IV {contract?.impliedVolatility ? (contract.impliedVolatility * 100).toFixed(0) + '%' : '—'}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13 }}>✕</button>
      </div>

      {/* Quick metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
        {[
          { label: 'Bid',    val: `$${contract?.bid?.toFixed(2) ?? '—'}` },
          { label: 'Ask',    val: `$${contract?.ask?.toFixed(2) ?? '—'}` },
          { label: 'Volume', val: contract?.volume?.toLocaleString() ?? '—' },
          { label: 'OI',     val: contract?.openInterest?.toLocaleString() ?? '—' },
        ].map(({ label, val }) => (
          <div key={label} style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, borderBottom: '0.5px solid var(--border-subtle)', paddingBottom: 8 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontSize: 11, padding: '3px 12px',
            border: 'none', cursor: 'pointer', borderRadius: 20,
            background: tab === t.id ? accent : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--text-secondary)',
            fontWeight: tab === t.id ? 600 : 400,
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Chart area */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)', fontSize: 11 }}>
          <span className="spinner" style={{ marginRight: 6 }} />Loading history from DB...
        </div>
      ) : snapshots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)', fontSize: 11 }}>
          No data yet for this contract — this was the first snapshot just saved.
          <br />Open the chart again after a few minutes to start seeing a trend.
        </div>
      ) : (
        <div>
          {tab === 'price'  && <LineChart snapshots={snapshots} field="mid"                label="Mid Price"         fmt={fmtMid} color={accent} height={180} />}
          {tab === 'iv'     && <LineChart snapshots={snapshots} field="implied_volatility"  label="Implied Volatility" fmt={fmtIV}  color="#f59e0b" height={180} />}
          {tab === 'oi'     && <BarChart  snapshots={snapshots} field="open_interest"       label="Open Interest"     color="#3b82f6" height={140} />}
          {tab === 'volume' && <BarChart  snapshots={snapshots} field="volume"              label="Volume"            color={accent}  height={140} />}
        </div>
      )}
    </div>
  )
}
