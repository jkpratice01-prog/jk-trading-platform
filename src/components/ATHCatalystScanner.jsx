import React, { useState, useEffect } from 'react'
import { backendATHCatalyst, backendSectorMomentum } from '../api/backend.js'

const CRITERIA = [
  { key: 'nearATH',          label: 'ATH',      tip: 'Within 5% of 52-week high'      },
  { key: 'upcomingEarnings', label: 'Earnings', tip: 'Earnings in next 30 days'        },
  { key: 'volSurge',         label: 'Volume',   tip: 'Today volume > 1.5× avg'         },
  { key: 'hotSector',        label: 'Sector',   tip: 'AI / Semiconductor / Cloud'      },
  { key: 'analystUpside',    label: 'Analyst',  tip: 'Wall Street analysts (Goldman, Morgan Stanley, JPMorgan, etc.) set 12-month price targets. This criterion passes when their consensus target is >10% above current price — meaning pros expect significant upside.' },
]

const ER_PHASE_ORDER = [
  { key: 'early',       label: '📅 Too Early',  window: '> 8 wks', color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)',       tip: 'More than 8 weeks before earnings. Too early — watch and wait.' },
  { key: 'positioning', label: '📍 Building',   window: '4–8 wks', color: '#86efac',              bg: 'rgba(134,239,172,0.1)',    tip: '4-8 weeks before earnings. Smart money starts accumulating quietly.' },
  { key: 'sweet_spot',  label: '⭐ Sweet Spot', window: '2–4 wks', color: 'var(--amber-text)',    bg: 'rgba(251,191,36,0.12)',    tip: '2-4 weeks before earnings — the classic pro entry window. AMD & SNDK were here before their ATH breakouts.' },
  { key: 'hot_zone',    label: '🔥 Hot Zone',   window: '1–2 wks', color: '#f97316',              bg: 'rgba(249,115,22,0.12)',    tip: '1-2 weeks before earnings. Institutions are actively positioning.' },
  { key: 'imminent',    label: '⚡ Imminent',   window: '< 1 wk',  color: 'var(--red-text)',      bg: 'rgba(239,68,68,0.12)',     tip: 'Earnings in less than 1 week. Last chance or wait for the result.' },
]
const ER_PHASES = Object.fromEntries(ER_PHASE_ORDER.map(p => [p.key, p]))

function scoreColor(s) {
  if (s >= 5) return 'var(--green-text)'
  if (s >= 4) return '#4ade80'
  if (s >= 3) return 'var(--amber-text)'
  return 'var(--text-tertiary)'
}

function scoreLabel(s) {
  if (s >= 5) return 'PRO SETUP'
  if (s >= 4) return 'STRONG'
  if (s >= 3) return 'MODERATE'
  return 'WEAK'
}

function pct(v, plus = false) {
  if (v == null) return '—'
  return (plus && v > 0 ? '+' : '') + v.toFixed(1) + '%'
}

function SectorBar({ sectors }) {
  if (!sectors?.length) return null
  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Sector Momentum (5-day)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {sectors.map(s => {
          const c5 = s.change5d
          const color = c5 >= 2 ? 'var(--green-text)' : c5 >= 0 ? '#86efac' : c5 >= -2 ? 'var(--amber-text)' : 'var(--red-text)'
          const bg    = c5 >= 2 ? 'rgba(74,222,128,0.12)' : c5 >= 0 ? 'rgba(134,239,172,0.08)' : c5 >= -2 ? 'rgba(251,191,36,0.1)' : 'rgba(248,113,113,0.1)'
          return (
            <div key={s.symbol} style={{
              padding: '5px 10px', borderRadius: 7,
              background: bg, border: `0.5px solid ${color}40`,
              minWidth: 90,
            }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>{s.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{s.symbol}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{pct(c5, true)}</span>
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
                1d: <span style={{ color: s.change1d >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>{pct(s.change1d, true)}</span>
                &nbsp;·&nbsp;1mo: <span style={{ color: s.change20d >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>{pct(s.change20d, true)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CriteriaDots({ criteria }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {CRITERIA.map(c => (
        <div
          key={c.key}
          title={`${c.label}: ${c.tip}`}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
        >
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: criteria[c.key] ? 'var(--green-text)' : 'var(--bg-tertiary)',
            border: `1px solid ${criteria[c.key] ? 'var(--green-text)' : 'var(--border-subtle)'}`,
          }} />
          <span style={{
            fontSize: 7, fontWeight: 600, letterSpacing: '0.02em',
            color: criteria[c.key] ? 'var(--green-text)' : 'var(--text-tertiary)',
          }}>
            {c.label.slice(0, 3).toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  )
}

function DetailPanel({ row, onAnalyze, onClose }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${scoreColor(row.proScore)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{row.symbol}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
              background: 'var(--bg-tertiary)', color: scoreColor(row.proScore),
            }}>
              {row.proScore}/5 · {scoreLabel(row.proScore)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{row.shortName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {row.sector}{row.industry ? ` · ${row.industry}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-primary" style={{ fontSize: 10, padding: '3px 10px' }} onClick={() => onAnalyze(row.symbol)}>
            Open Analyzer
          </button>
          <button className="btn" style={{ fontSize: 10, padding: '3px 10px' }} onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Criteria checklist */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 14 }}>
        {CRITERIA.map(c => {
          const passed = row.criteria[c.key]
          const isAnalyst = c.key === 'analystUpside'
          return (
            <div key={c.key} style={{
              padding: '8px 10px', borderRadius: 7,
              background: passed ? 'rgba(74,222,128,0.1)' : 'var(--bg-tertiary)',
              border: `0.5px solid ${passed ? 'rgba(74,222,128,0.4)' : 'var(--border-subtle)'}`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 16, marginBottom: 3 }}>{passed ? '✅' : '⬜'}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: passed ? 'var(--green-text)' : 'var(--text-tertiary)' }}>
                {c.label}
              </div>
              {isAnalyst ? (
                <div style={{ fontSize: 8, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.5, textAlign: 'left' }}>
                  <div style={{ marginBottom: 2 }}>
                    Bank analysts (Goldman, MS, JPM…) publish <strong style={{ color: 'var(--text-secondary)' }}>12-month price targets</strong>.
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    ✅ passes when consensus target is <strong style={{ color: 'var(--text-secondary)' }}>&gt;10% above current price</strong>.
                  </div>
                  {row.analystTarget && (
                    <div style={{ color: passed ? 'var(--green-text)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                      Target: ${row.analystTarget} (+{row.upsidePct?.toFixed(1)}%)
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>{c.tip}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        {[
          { label: 'Price',              value: `$${row.price?.toFixed(2)}` },
          { label: '52-Week High',       value: `$${row.yearHigh?.toFixed(2)}` },
          { label: 'Distance from ATH',  value: row.distFromATH != null ? `${row.distFromATH.toFixed(1)}% below` : `${(100 - row.athPct).toFixed(1)}% below`, color: row.nearATH ? 'var(--green-text)' : undefined,
            tip: 'How far the price is below its 52-week high. <3% = coiling at ATH.' },
          { label: 'Today\'s Change',    value: row.todayChangePct != null ? (row.todayChangePct >= 0 ? `+${row.todayChangePct.toFixed(2)}%` : `${row.todayChangePct.toFixed(2)}%`) : '—',
            color: row.todayChangePct > 0 ? 'var(--green-text)' : row.todayChangePct < 0 ? 'var(--red-text)' : undefined,
            tip: 'How much the stock moved today (vs previous close).' },
          { label: 'Volume Ratio',       value: `${row.volRatio}×`,           color: row.volSurge ? 'var(--amber-text)' : undefined,
            tip: 'Today\'s volume ÷ 3-month average. >1.5× = unusual interest.' },
          { label: 'Market Cap',         value: row.marketCap || '—', tip: 'Company size. Larger = more institutional coverage.' },
          { label: '52-Wk High Hit',      value: row.athDate || '—', color: row.daysSinceATH <= 7 ? 'var(--green-text)' : row.daysSinceATH <= 14 ? '#4ade80' : undefined,
            tip: 'When the stock last reached its 52-week high. Recent = actively making new highs.' },
          { label: 'Earnings Date',      value: row.earningsDate || '—',      color: row.upcomingEarnings ? 'var(--amber-text)' : undefined },
          { label: 'Days to Earnings',   value: row.daysToEarnings ? `${row.daysToEarnings} days` : '—', color: row.daysToEarnings <= 5 ? 'var(--red-text)' : row.daysToEarnings <= 14 ? 'var(--amber-text)' : undefined },
          { label: 'Pre-ER Phase',       value: row.preErPhase ? ER_PHASES[row.preErPhase]?.label : '—',
            color: row.preErPhase ? ER_PHASES[row.preErPhase]?.color : undefined,
            tip: row.preErPhase ? ER_PHASES[row.preErPhase]?.tip : undefined },
          { label: 'Weeks to Earnings', value: row.weeksToEarnings != null ? `${row.weeksToEarnings} wks` : '—' },
          { label: 'Analyst Target',     value: row.analystTarget ? `$${row.analystTarget}` : '—',
            tip: 'Wall Street consensus price target (average of all analyst estimates).' },
          { label: 'Analyst Upside',     value: row.upsidePct != null ? `+${row.upsidePct?.toFixed(1)}%` : '—', color: row.analystUpside ? 'var(--green-text)' : undefined,
            tip: 'How much upside analysts see from current price. >10% = bullish conviction.' },
        ].map(({ label, value, color, tip }) => (
          <div key={label} title={tip} style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, border: '0.5px solid var(--border-subtle)', cursor: tip ? 'help' : undefined }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Pre-ER Phase Timeline */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Pre-Earnings Phase
          {!row.preErPhase && <span style={{ fontWeight: 400, marginLeft: 6 }}>— no earnings in next 8 weeks</span>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {ER_PHASE_ORDER.map(p => {
            const isActive = p.key === row.preErPhase
            return (
              <div
                key={p.key}
                title={p.tip}
                style={{
                  flex: 1, padding: '7px 8px', borderRadius: 6, cursor: 'help',
                  background: isActive ? p.bg : 'var(--bg-tertiary)',
                  border: isActive ? `1.5px solid ${p.color}` : '0.5px solid var(--border-subtle)',
                  opacity: !row.preErPhase ? 0.4 : isActive ? 1 : 0.4,
                }}
              >
                <div style={{ fontSize: 13, textAlign: 'center', marginBottom: 3 }}>{p.label.split(' ')[0]}</div>
                <div style={{ fontSize: 9, fontWeight: isActive ? 700 : 400, textAlign: 'center', color: isActive ? p.color : 'var(--text-tertiary)', lineHeight: 1.3 }}>
                  {p.label.split(' ').slice(1).join(' ')}
                </div>
                <div style={{ fontSize: 8, textAlign: 'center', marginTop: 2, color: isActive ? p.color : 'var(--text-tertiary)', opacity: 0.8 }}>
                  {isActive && row.daysToEarnings ? `${row.daysToEarnings}d away` : p.window}
                </div>
              </div>
            )
          })}
        </div>
        {row.preErPhase && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5, padding: '5px 8px', borderRadius: 5, background: 'var(--bg-tertiary)', borderLeft: `2px solid ${ER_PHASES[row.preErPhase]?.color}` }}>
            {ER_PHASES[row.preErPhase]?.tip}
          </div>
        )}
      </div>
    </div>
  )
}

const COLUMN_GUIDE = [
  { col: 'Score',      what: 'How many of the 5 pro criteria the stock satisfies (0–5)', look: '4+ = high-probability setup like AMD/SNDK before breakout' },
  { col: 'Criteria ●', what: 'Five dots — ATH · ERN · VOL · SEC · ANL — green = criterion met', look: 'More green = stronger confluence of signals' },
  { col: 'Price',      what: 'Current market price', look: 'Context for position sizing and options strike selection' },
  { col: 'Today',      what: 'Today\'s % price change vs previous close', look: 'Strong day on a 4+ scorer = momentum confirming the setup' },
  { col: 'From ATH',   what: 'How far below the 52-week high the stock currently sits', look: '<3% = consolidating at ATH, energy building for breakout' },
  { col: 'ATH Date',   what: 'When the stock last hit its 52-week high ("This week", "3w ago", etc.)', look: '"This week" or "Last week" = actively making new highs now — strongest signal' },
  { col: 'ER Phase',   what: 'How far before earnings the stock sits — named phases pros use to time entries', look: '⭐ Sweet Spot (2-4 wks) is the ideal entry. 📍 Building (4-8 wks) = early. 🔥 Hot Zone (1-2 wks) = institutions already in.' },
  { col: 'Vol Ratio',  what: 'Today\'s volume ÷ 3-month average volume', look: '>2× = unusual institutional interest; >3× = major accumulation' },
  { col: 'Earnings',   what: 'Days until next earnings report + the date', look: '<14 days = catalyst imminent; <5 days = trade now or wait' },
  { col: 'Analyst ↑',  what: 'Bank analysts (Goldman Sachs, Morgan Stanley, JPMorgan, etc.) publish 12-month price targets. This shows how far above the current price their consensus target sits.', look: '>10% passes the criterion. >15% = strong conviction. Before AMD\'s breakout, Morgan Stanley raised its target to $360 — institutions follow those upgrades.' },
  { col: 'Sector',     what: 'Industry sector (hover for sub-industry)', look: 'AI/Semis/Cloud sectors produce the most ATH breakouts in current market' },
]

export default function ATHCatalystScanner({ onAnalyze }) {
  const [scanData,    setScanData]    = useState(null)
  const [sectorData,  setSectorData]  = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [showGuide,   setShowGuide]   = useState(false)
  const [minScore,    setMinScore]    = useState(3)
  const [selected,    setSelected]    = useState(null)
  const [lastScan,    setLastScan]    = useState(null)
  const [sectorFilter, setSectorFilter] = useState('ALL')
  const [sortBy,      setSortBy]      = useState('proScore')

  async function runScan() {
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const [scan, sectors] = await Promise.all([
        backendATHCatalyst(minScore),
        backendSectorMomentum(),
      ])
      setScanData(scan)
      setSectorData(sectors)
      setLastScan(new Date().toLocaleTimeString())
    } catch {
      setError('Scan failed — check that the backend is running')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runScan() }, [])

  const sectors = [...new Set((scanData?.results || []).map(r => r.sector))].sort()

  const results = (scanData?.results || [])
    .filter(r => sectorFilter === 'ALL' || r.sector === sectorFilter)
    .sort((a, b) => {
      if (sortBy === 'proScore')   return b.proScore - a.proScore
      if (sortBy === 'athPct')     return b.athPct - a.athPct
      if (sortBy === 'volRatio')   return b.volRatio - a.volRatio
      if (sortBy === 'earnings')   return (a.daysToEarnings ?? 999) - (b.daysToEarnings ?? 999)
      if (sortBy === 'upside')     return (b.upsidePct ?? -999) - (a.upsidePct ?? -999)
      return b.proScore - a.proScore
    })

  const perfect  = (scanData?.results || []).filter(r => r.proScore === 5).length
  const strong   = (scanData?.results || []).filter(r => r.proScore === 4).length
  const moderate = (scanData?.results || []).filter(r => r.proScore === 3).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">🎯 ATH Catalyst Scanner</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Finds stocks like AMD &amp; SNDK before they break out · {scanData?.count ?? 0} signals
          </span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.7 }}>
          Scores each stock on 5 criteria pros use to identify ATH breakouts:
          {' '}<strong style={{ color: 'var(--text-primary)' }}>Near 52-week high</strong>,
          {' '}<strong style={{ color: 'var(--text-primary)' }}>upcoming earnings</strong>,
          {' '}<strong style={{ color: 'var(--text-primary)' }}>volume surge</strong>,
          {' '}<strong style={{ color: 'var(--text-primary)' }}>hot sector</strong>, and
          {' '}<strong style={{ color: 'var(--text-primary)' }}>analyst upside &gt;10%</strong>.
          {' '}5/5 = pro setup identical to AMD &amp; SNDK patterns.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={runScan} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? 'Scanning...' : '🔄 Scan Now'}
          </button>

          <select
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            style={{ fontSize: 11, padding: '5px 8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}
          >
            <option value={2}>Min score: 2+</option>
            <option value={3}>Min score: 3+</option>
            <option value={4}>Min score: 4+</option>
            <option value={5}>Score: 5 only (Perfect)</option>
          </select>

          <select
            value={sectorFilter}
            onChange={e => setSectorFilter(e.target.value)}
            style={{ fontSize: 11, padding: '5px 8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}
          >
            <option value="ALL">All sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ fontSize: 11, padding: '5px 8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}
          >
            <option value="proScore">Sort: Pro Score</option>
            <option value="athPct">Sort: ATH Proximity</option>
            <option value="volRatio">Sort: Volume Surge</option>
            <option value="earnings">Sort: Nearest Earnings</option>
            <option value="upside">Sort: Analyst Upside</option>
          </select>

          {lastScan && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Scanned {lastScan}</span>}
        </div>

        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 'var(--r-md)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Sector momentum */}
      {sectorData && <SectorBar sectors={sectorData.sectors} />}

      {/* Summary chips */}
      {scanData && (
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: '5/5 — Pro Setup',  count: perfect,  color: 'var(--green-text)' },
            { label: '4/5 — Strong',     count: strong,   color: '#4ade80' },
            { label: '3/5 — Moderate',   count: moderate, color: 'var(--amber-text)' },
          ].map(({ label, count, color }) => (
            <div key={label} style={{
              padding: '6px 14px', borderRadius: 8,
              background: 'var(--bg-tertiary)', border: '0.5px solid var(--border-subtle)',
              fontSize: 11, color, fontWeight: 600,
            }}>
              {label}: {count}
            </div>
          ))}
        </div>
      )}

      {/* Column key — always visible above table */}
      {results.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 6, padding: '10px 14px',
          background: 'var(--bg-secondary)', borderRadius: 8,
          border: '0.5px solid var(--border-subtle)',
        }}>
          {[
            { col: 'Score',      icon: '🎯', desc: '0–5 criteria met. 4+ = high-probability setup.' },
            { col: 'Today',      icon: '📈', desc: "Today's % change vs yesterday's close." },
            { col: 'From ATH',   icon: '🏔', desc: 'Distance below 52-week high. <3% = coiling at ATH.' },
            { col: 'ATH Date',   icon: '📅', desc: 'When the 52-week high was last hit. "This week" = best.' },
            { col: 'Vol Ratio',  icon: '⚡', desc: "Today's volume ÷ avg. >1.5× = unusual buying interest." },
            { col: 'Earnings',   icon: '💰', desc: 'Days to next earnings + pre-ER phase badge.' },
            { col: 'ER Phase',   icon: '⭐', desc: '⭐ Sweet Spot (2-4 wks) = ideal entry window for pros.' },
            { col: 'Analyst ↑',  icon: '🏦', desc: 'Bank consensus target upside. >10% = Wall St. bullish.' },
            { col: 'Criteria ●', icon: '✅', desc: 'ATH · ERN · VOL · SEC · ANL — green dot = criterion met.' },
          ].map(({ col, icon, desc }) => (
            <div key={col} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 13, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{icon}</span>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>{col}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}> — {desc}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th title="Stock ticker and company name">Symbol</th>
                  <th title="Pro Score 0–5: how many of the 5 professional criteria this stock meets. 5/5 = PRO SETUP (same pattern as AMD/SNDK breakouts)">Score</th>
                  <th title="5 criteria dots (ATH · ERN · VOL · SEC · ANL). Green = criterion met. Hover each dot for details.">Criteria</th>
                  <th title="Current market price">Price</th>
                  <th title="Today's % price change vs previous close. Strong move on a high scorer = momentum confirming the setup.">Today</th>
                  <th title="Distance below the 52-week high. Under 3% = price coiling at ATH, ready to break out. Green = within 5%.">From ATH</th>
                  <th title="When the stock last hit its 52-week high. 'This week' or 'Last week' = actively making new highs NOW. Months ago = long consolidation.">
                    <div>ATH Date</div>
                    <div style={{ fontSize: 8, fontWeight: 400, color: 'var(--text-tertiary)', marginTop: 2 }}>when last hit</div>
                  </th>
                  <th title="Today's volume ÷ 3-month average. Over 1.5× = unusual interest. Over 3× = major institutional accumulation.">Vol Ratio</th>
                  <th title="Days/weeks until earnings + pre-ER phase. Sweet Spot (2-4 wks) = ideal entry. Building (4-8 wks) = early accumulation. Hot Zone (1-2 wks) = active positioning.">
                    <div>Earnings</div>
                    <div style={{ fontSize: 8, fontWeight: 400, color: 'var(--text-tertiary)', marginTop: 2 }}>days · phase</div>
                  </th>
                  <th title="Percentage upside to Wall Street consensus analyst price target. Over 10% = analysts bullish. Often leads institutional buying.">
                    <div>Analyst ↑</div>
                    <div style={{ fontSize: 8, fontWeight: 400, color: 'var(--text-tertiary)', marginTop: 2 }}>Wall St. target upside</div>
                  </th>
                  <th title="Industry sector. AI, Semiconductor, and Cloud sectors produce the most ATH breakouts.">Sector</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(row => (
                  <React.Fragment key={row.symbol}>
                  <tr
                    style={{
                      cursor: 'pointer',
                      background: selected?.symbol === row.symbol ? 'var(--bg-tertiary)' : undefined,
                    }}
                    onClick={() => setSelected(s => s?.symbol === row.symbol ? null : row)}
                  >
                    <td>
                      <div>
                        <strong style={{ color: scoreColor(row.proScore), fontSize: 13 }}>{row.symbol}</strong>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.shortName}
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: scoreColor(row.proScore),
                        }}>
                          {row.proScore}/5
                        </span>
                        <span style={{ fontSize: 8, fontWeight: 700, color: scoreColor(row.proScore), opacity: 0.8 }}>
                          {scoreLabel(row.proScore)}
                        </span>
                      </div>
                    </td>

                    <td><CriteriaDots criteria={row.criteria} /></td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      ${row.price?.toFixed(2)}
                    </td>

                    <td style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                      color: row.todayChangePct > 0 ? 'var(--green-text)' : row.todayChangePct < 0 ? 'var(--red-text)' : 'var(--text-tertiary)',
                    }}>
                      {row.todayChangePct != null
                        ? (row.todayChangePct >= 0 ? '+' : '') + row.todayChangePct.toFixed(2) + '%'
                        : '—'}
                    </td>

                    <td
                      title={`52-week high: $${row.yearHigh?.toFixed(2)}`}
                      style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                        color: row.nearATH ? 'var(--green-text)' : 'var(--text-primary)',
                        cursor: 'help',
                      }}
                    >
                      {(row.distFromATH ?? (100 - row.athPct)).toFixed(1)}%↓
                    </td>

                    <td title={row.daysSinceATH != null ? `${row.daysSinceATH} days since 52-week high` : ''}>
                      {row.athDate ? (
                        <span style={{
                          fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600,
                          color: row.daysSinceATH <= 7 ? 'var(--green-text)'
                               : row.daysSinceATH <= 14 ? '#4ade80'
                               : row.daysSinceATH <= 30 ? 'var(--amber-text)'
                               : 'var(--text-tertiary)',
                        }}>
                          {row.athDate}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    <td style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                      color: row.volSurge ? 'var(--amber-text)' : 'var(--text-primary)',
                    }}>
                      {row.volRatio}×
                    </td>

                    <td>
                      {row.earningsDate ? (() => {
                        const phase = row.preErPhase ? ER_PHASES[row.preErPhase] : null
                        return (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                              <span style={{
                                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                                color: row.daysToEarnings <= 7 ? 'var(--red-text)'
                                     : row.daysToEarnings <= 14 ? '#f97316'
                                     : row.daysToEarnings <= 28 ? 'var(--amber-text)'
                                     : 'var(--text-primary)',
                              }}>
                                {row.daysToEarnings}d
                              </span>
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3 }}>{row.earningsDate}</div>
                            {phase && (
                              <span
                                title={phase.tip}
                                style={{
                                  fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
                                  color: phase.color, background: phase.bg,
                                  display: 'inline-block', cursor: 'help', whiteSpace: 'nowrap',
                                }}
                              >
                                {phase.label}
                              </span>
                            )}
                          </div>
                        )
                      })() : (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    <td style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                      color: row.analystUpside ? 'var(--green-text)' : 'var(--text-tertiary)',
                    }}>
                      {row.upsidePct != null ? `+${row.upsidePct?.toFixed(1)}%` : '—'}
                    </td>

                    <td title={row.industry || row.sector}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{row.sector}</div>
                      {row.industry && (
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.industry}
                        </div>
                      )}
                    </td>

                    <td>
                      <button
                        className="btn"
                        style={{ fontSize: 9, padding: '2px 6px' }}
                        onClick={e => { e.stopPropagation(); onAnalyze(row.symbol) }}
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                  {selected?.symbol === row.symbol && (
                    <tr key={row.symbol + '-detail'}>
                      <td colSpan={11} style={{ padding: 0, background: 'var(--bg-secondary)' }}>
                        <div style={{ padding: '12px 14px', borderTop: `2px solid ${scoreColor(row.proScore)}` }}>
                          <DetailPanel row={row} onAnalyze={onAnalyze} onClose={() => setSelected(null)} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Scanning {170}+ stocks…</div>
          <div style={{ fontSize: 11 }}>First scan takes 60–90 seconds. Results cached 15 min.</div>
        </div>
      )}

      {!loading && !error && results.length === 0 && scanData && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>🎯</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>No stocks matched the criteria at this score threshold</div>
          <div style={{ fontSize: 11 }}>
            Try lowering the minimum score to 2+ or 3+ to see more results.
          </div>
        </div>
      )}

      {/* Column Guide */}
      <div className="card" style={{ padding: '10px 14px' }}>
        <button
          onClick={() => setShowGuide(g => !g)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {showGuide ? '▾' : '▸'} Column Guide — what each column means and what to look for
          </span>
        </button>
        {showGuide && (
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Column</th>
                  <th>What it shows</th>
                  <th>What to look for</th>
                </tr>
              </thead>
              <tbody>
                {COLUMN_GUIDE.map(({ col, what, look }) => (
                  <tr key={col}>
                    <td><strong style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{col}</strong></td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{what}</td>
                    <td style={{ fontSize: 11, color: 'var(--amber-text)' }}>{look}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>How to use this scanner:</strong>
              {' '}Start with <strong>Score 4+</strong> stocks. Check that <strong>Earnings</strong> are within 14 days.
              Confirm <strong>From ATH</strong> is under 3%. Look for <strong>Vol Ratio</strong> above 1.5× — that's institutions quietly accumulating.
              A 5/5 stock with earnings in 7 days and volume at 2× is the closest pattern to what AMD and SNDK showed before their breakouts.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
