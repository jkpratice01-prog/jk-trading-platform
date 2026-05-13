import { useState, useEffect } from 'react'
import { backendQuotes, backendChart } from '../api/backend.js'
import { fmtPrice, fmtPct } from '../utils/helpers.js'

function fmtDate(ts) {
  // ts is 'YYYY-MM-DD'
  if (!ts) return ''
  const [, mm, dd] = ts.split('-')
  return `${mm}/${dd}`
}

function Sparkline({ closes, timestamps, height = 100 }) {
  if (!closes?.length || closes.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
      No data
    </div>
  )
  const W = 400, H = height, pad = 8
  const w = W - pad * 2, h = H - pad * 2
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const pts = closes.map((c, i) => [
    pad + (i / (closes.length - 1)) * w,
    pad + h - ((c - min) / range) * h,
  ])
  const up = closes[closes.length - 1] >= closes[0]
  const stroke = up ? 'var(--green)' : 'var(--red)'
  const fill   = up ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'
  const linePath = 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')
  const areaPath = `M${pad},${pad + h} L` +
    pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L') +
    ` L${pad + w},${pad + h} Z`
  const [lx, ly] = pts[pts.length - 1]

  // 5 evenly-spaced date tick indices
  const tickCount = 5
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    Math.round(i * (closes.length - 1) / (tickCount - 1))
  )

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} preserveAspectRatio="none">
        <path d={areaPath} fill={fill} />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r={4} fill={stroke} />
      </svg>
      {/* Date axis */}
      <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
        {ticks.map(idx => {
          const pct = idx / (closes.length - 1) * 100
          return (
            <span key={idx} style={{
              position: 'absolute',
              left: `${pct}%`,
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
            }}>
              {fmtDate(timestamps?.[idx])}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function Tracker({ onAnalyze }) {
  const [tracked,     setTracked]     = useState(() => JSON.parse(localStorage.getItem('tracked_tickers') || '[]'))
  const [input,       setInput]       = useState('')
  const [quotes,      setQuotes]      = useState({})
  const [loading,     setLoading]     = useState(false)
  const [expanded,    setExpanded]    = useState(null)
  const [histData,    setHistData]    = useState({})
  const [histLoading, setHistLoading] = useState({})

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

  async function toggleExpand(sym) {
    if (expanded === sym) { setExpanded(null); return }
    setExpanded(sym)
    if (histData[sym]) return
    setHistLoading(prev => ({ ...prev, [sym]: true }))
    try {
      const d = await backendChart(sym, 30, '1d')
      setHistData(prev => ({ ...prev, [sym]: {
        closes:     d.close      || [],
        opens:      d.open       || [],
        highs:      d.high       || [],
        lows:       d.low        || [],
        volumes:    d.volume     || [],
        timestamps: d.timestamps || [],
      }}))
    } catch {
      setHistData(prev => ({ ...prev, [sym]: { closes: [], opens: [], highs: [], lows: [], volumes: [], timestamps: [] } }))
    } finally {
      setHistLoading(prev => ({ ...prev, [sym]: false }))
    }
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
    if (expanded === sym) setExpanded(null)
  }

  const expQuote = expanded && quotes[expanded]
  const expHist  = expanded && histData[expanded]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
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

      {/* ── Ticker cards ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {tracked.map(sym => {
          const q        = quotes[sym]
          const up       = (q?.regularMarketChangePercent ?? 0) >= 0
          const isActive = expanded === sym
          return (
            <div
              key={sym}
              onClick={() => toggleExpand(sym)}
              style={{
                padding: 12,
                background: isActive ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                border: `0.5px solid ${isActive ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--r-md)',
                cursor: 'pointer',
                transition: 'background var(--dur) var(--ease)',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-secondary)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{sym}</strong>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{isActive ? '▲' : '▼'}</span>
                  <span
                    onClick={e => { e.stopPropagation(); removeTracker(sym) }}
                    style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 11 }}
                  >✕</span>
                </div>
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

      {/* ── Expanded chart panel ──────────────────────────────────────────── */}
      {expanded && (
        <div className="card" style={{ padding: 16 }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{expanded}</span>
              {expQuote && (
                <>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                    {fmtPrice(expQuote.regularMarketPrice)}
                  </span>
                  <span style={{
                    fontSize: 12,
                    color: (expQuote.regularMarketChangePercent ?? 0) >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                  }}>
                    {fmtPct(expQuote.regularMarketChangePercent)}
                  </span>
                </>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>30-day history</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => onAnalyze(expanded)}>
                Open in Analyzer
              </button>
              <button className="btn" style={{ fontSize: 11 }} onClick={() => setExpanded(null)}>✕</button>
            </div>
          </div>

          {/* Chart + stats */}
          {histLoading[expanded] ? (
            <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
              <span className="spinner" style={{ marginRight: 6 }} />Loading chart…
            </div>
          ) : expHist?.closes?.length ? (
            <>
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

              {/* Sparkline */}
              <div style={{ flex: '1 1 280px', minWidth: 200 }}>
                <Sparkline closes={expHist.closes} timestamps={expHist.timestamps} height={100} />
              </div>

              {/* Stats sidebar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px 20px', minWidth: 140 }}>
                {[
                  { label: '30d High', value: fmtPrice(Math.max(...expHist.highs.length ? expHist.highs : expHist.closes)), color: 'var(--green-text)' },
                  { label: '30d Low',  value: fmtPrice(Math.min(...expHist.lows.length  ? expHist.lows  : expHist.closes)), color: 'var(--red-text)'  },
                  {
                    label: '30d Chg',
                    value: fmtPct(((expHist.closes.at(-1) - expHist.closes[0]) / expHist.closes[0]) * 100),
                    color: expHist.closes.at(-1) >= expHist.closes[0] ? 'var(--green-text)' : 'var(--red-text)',
                  },
                  ...(expQuote ? [
                    { label: 'Day High', value: fmtPrice(expQuote.regularMarketDayHigh), color: 'var(--green-text)' },
                    { label: 'Day Low',  value: fmtPrice(expQuote.regularMarketDayLow),  color: 'var(--red-text)'  },
                    {
                      label: 'Avg Vol 3M',
                      value: expQuote.averageDailyVolume3Month
                        ? `${(expQuote.averageDailyVolume3Month / 1e6).toFixed(1)}M`
                        : '—',
                    },
                  ] : []),
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {label}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: color || 'var(--text-primary)' }}>
                      {value ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── OHLCV table ─────────────────────────────────────────────── */}
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Open</th>
                    <th>High</th>
                    <th>Low</th>
                    <th>Close</th>
                    <th>Volume</th>
                    <th>Day Chg%</th>
                  </tr>
                </thead>
                <tbody>
                  {[...expHist.timestamps].reverse().map((ts, ri) => {
                    const i    = expHist.timestamps.length - 1 - ri
                    const o    = expHist.opens[i]
                    const h    = expHist.highs[i]
                    const l    = expHist.lows[i]
                    const c    = expHist.closes[i]
                    const vol  = expHist.volumes[i]
                    const prev = expHist.closes[i - 1]
                    const chg  = prev != null ? ((c - prev) / prev) * 100 : null
                    const up   = chg == null ? null : chg >= 0
                    return (
                      <tr key={ts}>
                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{ts}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtPrice(o)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green-text)' }}>{fmtPrice(h)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--red-text)'   }}>{fmtPrice(l)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtPrice(c)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                          {vol != null ? (vol >= 1e6 ? `${(vol / 1e6).toFixed(1)}M` : `${(vol / 1e3).toFixed(0)}K`) : '—'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: up == null ? 'var(--text-tertiary)' : up ? 'var(--green-text)' : 'var(--red-text)' }}>
                          {chg == null ? '—' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
              No chart data available
            </div>
          )}
        </div>
      )}

      {tracked.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)', fontSize: 12 }}>
          Add tickers above to track them. Click any card to expand 30-day price history.
        </div>
      )}
    </div>
  )
}