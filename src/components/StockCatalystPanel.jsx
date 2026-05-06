import { useState, useEffect } from 'react'
import { backendStockCatalyst } from '../api/backend.js'

const CRITERIA = [
  { key: 'nearATH',          label: 'Near ATH',   desc: 'Price within 5% of its 52-week high — stock is coiling at the top, ready to break out' },
  { key: 'upcomingEarnings', label: 'Earnings',   desc: 'Earnings report within 30 days — catalyst event is coming that can drive a big move' },
  { key: 'volSurge',         label: 'Vol Surge',  desc: "Today's volume is 1.5× above the 3-month average — unusual buying interest detected" },
  { key: 'hotSector',        label: 'Hot Sector', desc: 'Stock is in AI, Semiconductor, or Cloud — the sectors producing the most ATH breakouts right now' },
  { key: 'analystUpside',    label: 'Analyst ↑',  desc: 'Wall Street consensus price target is 10%+ above current price — bank analysts expect significant upside' },
]

const ER_PHASE_ORDER = [
  { key: 'early',       label: '📅',  name: 'Too Early',  window: '> 8 wks', color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)',     desc: 'More than 8 weeks before earnings. Too early for most setups — put it on your watchlist and wait.' },
  { key: 'positioning', label: '📍',  name: 'Building',   window: '4–8 wks', color: '#86efac',             bg: 'rgba(134,239,172,0.1)',  desc: '4–8 weeks before earnings. Smart money (institutions) quietly starts accumulating positions here. This is the earliest entry point.' },
  { key: 'sweet_spot',  label: '⭐',  name: 'Sweet Spot', window: '2–4 wks', color: 'var(--amber-text)',   bg: 'rgba(251,191,36,0.12)',  desc: '2–4 weeks before earnings — the classic pro entry window. AMD and SNDK were in this exact phase before their ATH breakouts.' },
  { key: 'hot_zone',    label: '🔥',  name: 'Hot Zone',   window: '1–2 wks', color: '#f97316',             bg: 'rgba(249,115,22,0.12)',  desc: '1–2 weeks before earnings. Institutions are now actively positioning — premium (options price) is rising fast.' },
  { key: 'imminent',    label: '⚡',  name: 'Imminent',   window: '< 1 wk',  color: 'var(--red-text)',     bg: 'rgba(239,68,68,0.12)',   desc: 'Less than 1 week before earnings. Last chance to enter, or wait for the result to avoid losing money on IV crush (options losing value after earnings).' },
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
  if (s >= 1) return 'WEAK'
  return 'NO SIGNAL'
}

export default function StockCatalystPanel({ symbol }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!symbol) return
    setData(null); setError(null); setLoading(true)
    backendStockCatalyst(symbol)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Could not load catalyst data'); setLoading(false) })
  }, [symbol])

  if (loading) return (
    <div className="card" style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span className="spinner" />Checking catalyst signals for {symbol}…
    </div>
  )
  if (error || !data || data.error) return null

  const score    = data.proScore ?? 0
  const criteria = data.criteria ?? {}
  const activePhase = data.preErPhase ? ER_PHASES[data.preErPhase] : null

  return (
    <div className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${scoreColor(score)}` }}>

      {/* ── Score header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          🎯 Pro Catalyst Score
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: scoreColor(score) }}>
          {score}/5
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 10,
          background: scoreColor(score) + '22', color: scoreColor(score),
        }}>
          {scoreLabel(score)}
        </span>
      </div>

      {/* ── Criteria — always-visible descriptions ───────────── */}
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        5 Pro Criteria
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {CRITERIA.map(c => {
          const passed = criteria[c.key]
          return (
            <div key={c.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0, width: 18, height: 18, borderRadius: '50%', marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
                background: passed ? 'rgba(74,222,128,0.18)' : 'var(--bg-tertiary)',
                border: `1.5px solid ${passed ? 'var(--green-text)' : 'var(--border-subtle)'}`,
                color: passed ? 'var(--green-text)' : 'var(--text-tertiary)',
              }}>
                {passed ? '✓' : '○'}
              </span>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: passed ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}>
                  {c.label}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                  — {c.desc}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Pre-ER Phase Timeline ─────────────────────────────── */}
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Pre-Earnings Phase Timeline
        {!data.preErPhase && (
          <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, color: 'var(--text-tertiary)' }}>
            — no earnings in next 8 weeks
          </span>
        )}
      </div>

      {/* Phase boxes */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {ER_PHASE_ORDER.map(p => {
          const isActive = p.key === data.preErPhase
          return (
            <div
              key={p.key}
              style={{
                flex: 1, padding: '8px 6px', borderRadius: 7, textAlign: 'center',
                background: isActive ? p.bg : 'var(--bg-tertiary)',
                border: isActive ? `2px solid ${p.color}` : '1px solid var(--border-subtle)',
                opacity: !data.preErPhase ? 0.35 : isActive ? 1 : 0.4,
              }}
            >
              <div style={{ fontSize: 16, marginBottom: 2 }}>{p.label}</div>
              <div style={{
                fontSize: 9, fontWeight: isActive ? 700 : 500,
                color: isActive ? p.color : 'var(--text-tertiary)',
                lineHeight: 1.3,
              }}>
                {p.name}
              </div>
              <div style={{
                fontSize: 8, marginTop: 3,
                color: isActive ? p.color : 'var(--text-tertiary)',
                opacity: isActive ? 1 : 0.7,
              }}>
                {isActive && data.daysToEarnings ? `${data.daysToEarnings}d away` : p.window}
              </div>
            </div>
          )
        })}
      </div>

      {/* Active phase description — always visible text */}
      <div style={{
        fontSize: 11, lineHeight: 1.6, padding: '8px 12px', borderRadius: 6,
        background: 'var(--bg-tertiary)',
        borderLeft: `3px solid ${activePhase ? activePhase.color : 'var(--border-subtle)'}`,
        color: activePhase ? 'var(--text-primary)' : 'var(--text-tertiary)',
      }}>
        {activePhase
          ? <><strong style={{ color: activePhase.color }}>{activePhase.label} {activePhase.name}</strong> — {activePhase.desc}</>
          : 'No earnings in the next 8 weeks. The phase timeline will activate once an earnings date is confirmed within 8 weeks.'}
      </div>

      {/* ── Key numbers ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 11, marginTop: 14 }}>
        {data.yearHigh && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>52-Wk High</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: data.nearATH ? 'var(--green-text)' : 'var(--text-primary)' }}>
              ${data.yearHigh?.toFixed(2)}
            </div>
            <div style={{ fontSize: 9, color: data.nearATH ? 'var(--green-text)' : 'var(--text-tertiary)' }}>
              {data.distFromATH != null
                ? data.distFromATH < 0.5 ? 'AT ATH ✓' : `${data.distFromATH.toFixed(1)}% below`
                : `${(100 - data.athPct).toFixed(1)}% below`}
            </div>
          </div>
        )}
        {data.athDate && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>ATH Hit</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600,
              color: data.daysSinceATH <= 7 ? 'var(--green-text)' : data.daysSinceATH <= 14 ? '#4ade80' : data.daysSinceATH <= 30 ? 'var(--amber-text)' : 'var(--text-tertiary)' }}>
              {data.athDate}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{data.daysSinceATH != null ? `${data.daysSinceATH}d ago` : ''}</div>
          </div>
        )}
        {data.volRatio != null && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>Vol Ratio</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: data.volSurge ? 'var(--amber-text)' : 'var(--text-primary)' }}>
              {data.volRatio}×
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>vs 3-mo avg</div>
          </div>
        )}
        {data.earningsDate && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>Next Earnings</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600,
              color: data.daysToEarnings <= 7 ? 'var(--red-text)' : data.daysToEarnings <= 14 ? '#f97316' : data.daysToEarnings <= 28 ? 'var(--amber-text)' : 'var(--text-primary)' }}>
              {data.daysToEarnings}d
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{data.earningsDate}</div>
          </div>
        )}
        {data.analystTarget && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>Analyst Target</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>${data.analystTarget}</div>
            {data.upsidePct != null && (
              <div style={{ fontSize: 9, color: data.analystUpside ? 'var(--green-text)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                {data.upsidePct > 0 ? '+' : ''}{data.upsidePct.toFixed(1)}% upside
              </div>
            )}
          </div>
        )}
        {data.marketCap && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>Market Cap</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{data.marketCap}</div>
          </div>
        )}
        {data.sector && data.sector !== 'Unknown' && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>Sector</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: data.hotSector ? 'var(--amber-text)' : 'var(--text-primary)' }}>{data.sector}</div>
            {data.industry && <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{data.industry}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
