import React, { useState, useEffect } from 'react'
import { backendThemeRockets } from '../api/backend.js'

const THEME_ICONS = {
  'AI & LLM':              '🤖',
  'Data Center Build-Out': '🏗️',
  'Memory & Storage':      '💾',
  'Semiconductors':        '⚡',
  'Nuclear & Power':       '☢️',
  'Defense & Security':    '🛡️',
  'Quantum Computing':     '🔬',
  'Biotech Catalyst':      '💊',
}

const MIN_GAIN_OPTIONS = [
  { label: '20%+', value: 20 },
  { label: '50%+', value: 50 },
  { label: '75%+', value: 75 },
  { label: '100%+', value: 100 },
]

function gainColor(g) {
  if (g >= 100) return '#f97316'
  if (g >= 75)  return '#fb923c'
  if (g >= 50)  return 'var(--green-text)'
  if (g >= 20)  return '#4ade80'
  return 'var(--text-secondary)'
}

function gainBg(g) {
  if (g >= 100) return 'rgba(249,115,22,0.15)'
  if (g >= 75)  return 'rgba(251,146,60,0.12)'
  if (g >= 50)  return 'rgba(34,197,94,0.12)'
  if (g >= 20)  return 'rgba(74,222,128,0.08)'
  return 'var(--bg-tertiary)'
}

function RocketBadge({ gain }) {
  if (gain >= 100) return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'rgba(249,115,22,0.2)', color: '#f97316' }}>🚀 100%+</span>
  if (gain >= 50)  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'rgba(34,197,94,0.15)', color: 'var(--green-text)' }}>🔥 50%+</span>
  return null
}

function fmt(n, decimals = 0) {
  if (n == null) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return n.toFixed(decimals)
}

function fmtVol(n) {
  if (!n) return '—'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n
}

function StockRow({ row, onAnalyze }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer', transition: 'background 0.15s' }}
        className="hoverable-row"
      >
        <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
          {row.symbol}
        </td>
        <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.shortName}
        </td>
        <td style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {row.themes.slice(0, 2).map(t => (
              <span key={t} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {THEME_ICONS[t] || ''} {t}
              </span>
            ))}
          </div>
        </td>
        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
          ${row.price?.toFixed(2)}
        </td>
        <td style={{ padding: '8px 10px' }}>
          <div style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 8,
            background: gainBg(row.gain30d), color: gainColor(row.gain30d),
            fontWeight: 700, fontSize: 13,
          }}>
            +{row.gain30d}%
          </div>
        </td>
        <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-secondary)' }}>
          {fmtVol(row.todayVol)}
          {row.volRatio > 2 && (
            <span style={{ marginLeft: 4, fontSize: 9, color: '#f97316' }}>{row.volRatio.toFixed(1)}×</span>
          )}
        </td>
        <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {fmt(row.marketCap)}
        </td>
        <td style={{ padding: '8px 10px' }}>
          <RocketBadge gain={row.gain30d} />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: '0 10px 12px 10px', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{row.sector}{row.industry ? ` · ${row.industry}` : ''}</span>
              <button
                className="btn btn-primary"
                style={{ fontSize: 10, padding: '3px 12px', marginLeft: 'auto' }}
                onClick={e => { e.stopPropagation(); onAnalyze(row.symbol) }}
              >
                Open Analyzer
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ThemeSection({ theme, rows, onAnalyze }) {
  const [collapsed, setCollapsed] = useState(false)
  const icon = THEME_ICONS[theme] || '📈'
  const topGain = rows[0]?.gain30d || 0
  return (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: collapsed ? 0 : 12 }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{theme}</span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: gainBg(topGain), color: gainColor(topGain), fontWeight: 600 }}>
          {rows.length} rocket{rows.length !== 1 ? 's' : ''} · top +{topGain}%
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: 11 }}>{collapsed ? '▶' : '▼'}</span>
      </div>
      {!collapsed && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['Symbol', 'Name', 'Themes', 'Price', '30d Gain', 'Volume', 'Mkt Cap', ''].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <StockRow key={row.symbol} row={row} onAnalyze={onAnalyze} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ThemeRocketScanner({ onAnalyze }) {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [minGain, setMinGain]   = useState(20)
  const [activeTheme, setActiveTheme] = useState('All')
  const [view, setView]         = useState('by-theme')  // 'by-theme' | 'list'

  const load = async (gain = minGain) => {
    setLoading(true)
    setError(null)
    try {
      const res = await backendThemeRockets(gain)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const allThemes = data?.themes || []
  const byTheme   = data?.byTheme || {}
  const rockets   = data?.rockets || []

  const filteredRockets = activeTheme === 'All'
    ? rockets
    : rockets.filter(r => r.themes.includes(activeTheme))

  const visibleByTheme = activeTheme === 'All'
    ? byTheme
    : activeTheme in byTheme ? { [activeTheme]: byTheme[activeTheme] } : {}

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🚀 Theme Rockets</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Stocks up 20%+ in last 30 days — grouped by hot themes
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Min Gain filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {MIN_GAIN_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setMinGain(opt.value); load(opt.value) }}
                className="btn"
                style={{
                  fontSize: 10, padding: '3px 10px',
                  background: minGain === opt.value ? 'var(--blue)' : 'var(--bg-tertiary)',
                  color:      minGain === opt.value ? '#fff' : 'var(--text-secondary)',
                  border:     minGain === opt.value ? 'none' : '1px solid var(--border-subtle)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[['by-theme', 'By Theme'], ['list', 'List']].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="btn"
                style={{
                  fontSize: 10, padding: '3px 10px',
                  background: view === v ? 'var(--bg-tertiary)' : 'transparent',
                  color:      view === v ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  borderBottom: view === v ? '2px solid var(--blue)' : '2px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 14px' }} onClick={() => load()}>
            {loading ? '…' : 'Scan'}
          </button>
        </div>
      </div>

      {/* Theme filter pills */}
      {!loading && data && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <button
            onClick={() => setActiveTheme('All')}
            style={{
              fontSize: 10, padding: '3px 12px', borderRadius: 20, cursor: 'pointer', border: 'none',
              background: activeTheme === 'All' ? 'var(--blue)' : 'var(--bg-tertiary)',
              color:      activeTheme === 'All' ? '#fff' : 'var(--text-secondary)',
              fontWeight: 600,
            }}
          >
            All ({rockets.length})
          </button>
          {allThemes.filter(t => byTheme[t]?.length > 0).map(t => (
            <button
              key={t}
              onClick={() => setActiveTheme(t)}
              style={{
                fontSize: 10, padding: '3px 12px', borderRadius: 20, cursor: 'pointer', border: 'none',
                background: activeTheme === t ? gainBg(byTheme[t][0]?.gain30d || 0) : 'var(--bg-tertiary)',
                color:      activeTheme === t ? gainColor(byTheme[t][0]?.gain30d || 0) : 'var(--text-secondary)',
                fontWeight: 600,
              }}
            >
              {THEME_ICONS[t] || ''} {t} ({byTheme[t].length})
            </button>
          ))}
        </div>
      )}

      {/* States */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
          <div style={{ fontSize: 13 }}>Scanning 30-day gains across themes…</div>
          <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text-tertiary)' }}>This takes ~30s the first time</div>
        </div>
      )}

      {error && !loading && (
        <div className="card" style={{ borderLeft: '3px solid var(--red)', padding: 16 }}>
          <div style={{ color: 'var(--red-text)', fontWeight: 600 }}>Scan failed</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{error}</div>
          <button className="btn" style={{ marginTop: 10, fontSize: 11 }} onClick={() => load()}>Retry</button>
        </div>
      )}

      {!loading && !error && data && data.total === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
          No stocks above {minGain}% gain in last 30 days
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && data.total > 0 && (
        <>
          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="card" style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: gainColor(100) }}>{rockets.filter(r => r.gain30d >= 100).length}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>🚀 100%+ Rockets</div>
            </div>
            <div className="card" style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green-text)' }}>{rockets.filter(r => r.gain30d >= 50).length}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>🔥 50%+ Movers</div>
            </div>
            <div className="card" style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{data.total}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total {minGain}%+ Movers</div>
            </div>
            {rockets[0] && (
              <div className="card" style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: gainColor(rockets[0].gain30d) }}>
                  {rockets[0].symbol} +{rockets[0].gain30d}%
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Top Performer</div>
              </div>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
              {data.scannedAt ? `Scanned ${new Date(data.scannedAt).toLocaleTimeString()}` : ''}
            </div>
          </div>

          {/* By-theme view */}
          {view === 'by-theme' && Object.entries(visibleByTheme).map(([theme, rows]) => (
            <ThemeSection key={theme} theme={theme} rows={rows} onAnalyze={onAnalyze} />
          ))}

          {/* Flat list view */}
          {view === 'list' && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {['Symbol', 'Name', 'Themes', 'Price', '30d Gain', 'Volume', 'Mkt Cap', ''].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRockets.map(row => (
                      <StockRow key={row.symbol} row={row} onAnalyze={onAnalyze} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}