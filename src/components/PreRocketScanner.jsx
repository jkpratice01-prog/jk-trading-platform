import React, { useState, useEffect } from 'react'
import { backendPreRockets } from '../api/backend.js'

const HORIZON_COLORS = {
  '15d':  { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444',  label: '🔥 Next 15 Days' },
  '30d':  { bg: 'rgba(249,115,22,0.13)',  text: '#f97316',  label: '⚡ Next 30 Days' },
  '60d':  { bg: 'rgba(234,179,8,0.12)',   text: '#eab308',  label: '📈 Next 60 Days' },
  '60d+': { bg: 'rgba(100,116,139,0.1)', text: '#94a3b8',  label: '🕐 60d+ / No Date' },
}

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

function scoreColor(s) {
  if (s >= 7) return '#ef4444'
  if (s >= 5) return '#f97316'
  if (s >= 3) return '#eab308'
  return 'var(--text-tertiary)'
}

function ScoreRing({ score }) {
  const color = scoreColor(score)
  return (
    <div style={{
      width: 42, height: 42, borderRadius: '50%',
      border: `3px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, fontWeight: 800, color }}>{score}</span>
    </div>
  )
}

function BreakdownBar({ breakdown }) {
  const cells = [
    { key: 'tech',     max: 4, label: 'Tech',     color: '#3b82f6' },
    { key: 'catalyst', max: 3, label: 'Catalyst',  color: '#ef4444' },
    { key: 'peers',    max: 2, label: 'Peers',     color: '#f97316' },
    { key: 'short',    max: 1, label: 'Short',     color: '#a855f7' },
    { key: 'coil',     max: 1, label: 'Coil',      color: '#eab308' },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {cells.map(c => {
        const val = breakdown?.[c.key] || 0
        const pct = (val / c.max) * 100
        return (
          <div key={c.key} title={`${c.label}: ${val}/${c.max}`}
            style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 48 }}>
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {c.label}
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-tertiary)' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: c.color, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 8, color: val > 0 ? c.color : 'var(--text-tertiary)' }}>
              {val}/{c.max}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CandidateCard({ row, onAnalyze }) {
  const hc = HORIZON_COLORS[row.horizon] || HORIZON_COLORS['60d+']
  return (
    <div className="card" style={{
      borderLeft: `3px solid ${scoreColor(row.preRocketScore)}`,
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <ScoreRing score={row.preRocketScore} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{row.symbol}</span>
            <span style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 10,
              background: hc.bg, color: hc.text, fontWeight: 700,
            }}>
              {hc.label}
            </span>
            {row.coil && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, background: 'rgba(234,179,8,0.15)', color: '#eab308', fontWeight: 700 }}>
                🪄 Coiling
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{row.shortName}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {row.themes.slice(0, 2).map(t => (
              <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
                {THEME_ICONS[t] || ''} {t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>${row.price?.toFixed(2)}</div>
          {row.gain30d != null && (
            <div style={{ fontSize: 10, color: row.gain30d >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
              {row.gain30d >= 0 ? '+' : ''}{row.gain30d}% / 30d
            </div>
          )}
        </div>
      </div>

      {/* Signal tags */}
      {row.signals?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {row.signals.map((s, i) => (
            <span key={i} style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 8,
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontWeight: 500,
            }}>{s}</span>
          ))}
        </div>
      )}

      {/* Score breakdown */}
      <BreakdownBar breakdown={row.breakdown} />

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 10, color: 'var(--text-secondary)' }}>
        {row.earningsDate && (
          <span>📅 Earnings <strong style={{ color: 'var(--text-primary)' }}>{row.earningsDate}</strong> ({row.earningsDays}d)</span>
        )}
        {row.rsi != null && (
          <span>RSI <strong style={{ color: row.rsi > 70 ? 'var(--red-text)' : row.rsi < 40 ? 'var(--green-text)' : 'var(--text-primary)' }}>{row.rsi}</strong></span>
        )}
        {row.volRatio != null && (
          <span>Vol <strong style={{ color: row.volRatio >= 2 ? '#f97316' : 'var(--text-primary)' }}>{row.volRatio}×</strong></span>
        )}
        {row.shortPct > 0 && (
          <span>Short <strong style={{ color: row.shortPct >= 12 ? '#a855f7' : 'var(--text-primary)' }}>{row.shortPct}%</strong></span>
        )}
        {row.peerRunCount > 0 && (
          <span><strong style={{ color: '#f97316' }}>{row.peerRunCount}</strong> peers ran 50%+</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {row.stopLoss && (
            <span style={{ color: 'var(--red-text)' }}>Stop ${row.stopLoss}</span>
          )}
          {row.takeProfit && (
            <span style={{ color: 'var(--green-text)', marginLeft: 6 }}>Target ${row.takeProfit}</span>
          )}
        </div>
        <button
          className="btn btn-primary"
          style={{ fontSize: 9, padding: '2px 10px', marginLeft: 4 }}
          onClick={() => onAnalyze(row.symbol)}
        >
          Analyze
        </button>
      </div>
    </div>
  )
}

function HorizonSection({ horizon, rows, onAnalyze }) {
  const hc = HORIZON_COLORS[horizon] || HORIZON_COLORS['60d+']
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: hc.text }}>{hc.label}</div>
        <span style={{ fontSize: 10, padding: '2px 10px', borderRadius: 10, background: hc.bg, color: hc.text, fontWeight: 600 }}>
          {rows.length} candidate{rows.length !== 1 ? 's' : ''}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: 11 }}>{collapsed ? '▶' : '▼'}</span>
      </div>
      {!collapsed && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
          {rows.map(r => <CandidateCard key={r.symbol} row={r} onAnalyze={onAnalyze} />)}
        </div>
      )}
    </div>
  )
}

export default function PreRocketScanner({ onAnalyze }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [activeHorizon, setActiveHorizon] = useState('All')
  const [activeTheme, setActiveTheme]     = useState('All')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await backendPreRockets(40)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const candidates = data?.candidates || []
  const byHorizon  = data?.byHorizon  || {}
  const themes     = data?.themes     || []

  // Filter by horizon + theme
  const filtered = candidates.filter(r => {
    const hOk = activeHorizon === 'All' || r.horizon === activeHorizon
    const tOk = activeTheme   === 'All' || r.themes.includes(activeTheme)
    return hOk && tOk
  })

  const filteredByHorizon = {}
  for (const r of filtered) {
    filteredByHorizon[r.horizon] = filteredByHorizon[r.horizon] || []
    filteredByHorizon[r.horizon].push(r)
  }

  const HORIZONS = ['15d', '30d', '60d', '60d+']
  const alreadyRan = data?.alreadyRan || {}
  const alreadyRanCount = Object.keys(alreadyRan).length

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🎯 Pre-Rocket Scanner</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Stocks in hot themes that haven't run yet — scored by tech setup + catalyst + peer momentum
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginLeft: 'auto', fontSize: 11, padding: '5px 16px' }}
          onClick={load}
          disabled={loading}
        >
          {loading ? '…scanning' : 'Scan'}
        </button>
      </div>

      {/* How it works */}
      <div className="card" style={{ marginBottom: 14, padding: '10px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
          Scoring (0-10)
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: 'var(--text-secondary)' }}>
          <span><span style={{ color: '#3b82f6', fontWeight: 700 }}>Tech 0-4</span> — Scanner score (Trend/RSI/MACD/Vol/Breakout)</span>
          <span><span style={{ color: '#ef4444', fontWeight: 700 }}>Catalyst 0-3</span> — Earnings in 15/30/60 days</span>
          <span><span style={{ color: '#f97316', fontWeight: 700 }}>Peers 0-2</span> — Theme peers already up 50%+</span>
          <span><span style={{ color: '#a855f7', fontWeight: 700 }}>Short 0-1</span> — Short float &gt;12% (squeeze fuel)</span>
          <span><span style={{ color: '#eab308', fontWeight: 700 }}>Coil 0-1</span> — Bollinger squeeze near 52w high</span>
        </div>
      </div>

      {/* States */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 13 }}>Running full analysis — technical scores + earnings + peer momentum…</div>
          <div style={{ fontSize: 11, marginTop: 6 }}>Takes 1-2 min (fetching 90d bars + options data)</div>
        </div>
      )}

      {error && !loading && (
        <div className="card" style={{ borderLeft: '3px solid var(--red)', padding: 16 }}>
          <div style={{ color: 'var(--red-text)', fontWeight: 600 }}>Scan failed</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>{error}</div>
          <button className="btn" style={{ marginTop: 10, fontSize: 11 }} onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'High Confidence (7+)', value: candidates.filter(r => r.preRocketScore >= 7).length, color: '#ef4444' },
              { label: 'Medium (5-6)',          value: candidates.filter(r => r.preRocketScore >= 5 && r.preRocketScore < 7).length, color: '#f97316' },
              { label: 'Watch List (3-4)',      value: candidates.filter(r => r.preRocketScore >= 3 && r.preRocketScore < 5).length, color: '#eab308' },
              { label: 'Already Ran (excl.)',   value: alreadyRanCount, color: 'var(--text-tertiary)' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
              {data.scannedAt ? `Scanned ${new Date(data.scannedAt).toLocaleTimeString()}` : ''}
            </div>
          </div>

          {/* Horizon filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {['All', ...HORIZONS].map(h => {
              const hc = HORIZON_COLORS[h]
              const cnt = h === 'All' ? filtered.length : (filteredByHorizon[h] || []).length
              return (
                <button
                  key={h}
                  onClick={() => setActiveHorizon(h)}
                  style={{
                    fontSize: 10, padding: '3px 12px', borderRadius: 20, cursor: 'pointer', border: 'none',
                    background: activeHorizon === h ? (hc?.bg || 'var(--blue-dim)') : 'var(--bg-tertiary)',
                    color:      activeHorizon === h ? (hc?.text || 'var(--blue)') : 'var(--text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  {h === 'All' ? `All (${cnt})` : `${HORIZON_COLORS[h]?.label} (${cnt})`}
                </button>
              )
            })}
          </div>

          {/* Theme filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTheme('All')}
              style={{
                fontSize: 10, padding: '3px 12px', borderRadius: 20, cursor: 'pointer', border: 'none',
                background: activeTheme === 'All' ? 'var(--blue)' : 'var(--bg-tertiary)',
                color:      activeTheme === 'All' ? '#fff' : 'var(--text-secondary)',
                fontWeight: 600,
              }}
            >
              All Themes
            </button>
            {themes.map(t => {
              const cnt = filtered.filter(r => r.themes.includes(t)).length
              if (!cnt) return null
              return (
                <button
                  key={t}
                  onClick={() => setActiveTheme(t)}
                  style={{
                    fontSize: 10, padding: '3px 12px', borderRadius: 20, cursor: 'pointer',
                    background: activeTheme === t ? 'var(--bg-tertiary)' : 'transparent',
                    color:      activeTheme === t ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    border:     activeTheme === t ? '1px solid var(--border-subtle)' : '1px solid transparent',
                    fontWeight: 600,
                  }}
                >
                  {THEME_ICONS[t] || ''} {t} ({cnt})
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
              No pre-rocket candidates match current filters
            </div>
          ) : (
            HORIZONS.filter(h => (filteredByHorizon[h] || []).length > 0).map(h => (
              <HorizonSection
                key={h}
                horizon={h}
                rows={filteredByHorizon[h] || []}
                onAnalyze={onAnalyze}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}