import React, { useState, useEffect } from 'react'
import { backendLowFloatMomentum } from '../api/backend.js'

const CRITERIA = [
  { key: 'lowFloat',    label: 'Float',    tip: 'Float < 100M shares — thin supply means violent moves' },
  { key: 'floatSurge',  label: 'F.Surge',  tip: '>5% of float traded today — unusually heavy demand vs. supply' },
  { key: 'volSurge',    label: 'Volume',   tip: 'Today volume > 2× 3-month average' },
  { key: 'nearHigh',    label: 'Near Hi',  tip: 'Price within 20% of 52-week high — momentum context' },
  { key: 'momentumDay', label: 'Momo',     tip: 'Up 3%+ today — move already starting' },
]

function floatRatioColor(r) {
  if (r == null) return 'var(--text-tertiary)'
  if (r >= 0.5)  return 'var(--red-text)'
  if (r >= 0.1)  return '#f97316'
  if (r >= 0.05) return 'var(--amber-text)'
  return 'var(--text-tertiary)'
}

function floatRatioBg(r) {
  if (r == null) return 'var(--bg-tertiary)'
  if (r >= 0.5)  return 'rgba(239,68,68,0.12)'
  if (r >= 0.1)  return 'rgba(249,115,22,0.12)'
  if (r >= 0.05) return 'rgba(251,191,36,0.1)'
  return 'var(--bg-tertiary)'
}

function scoreColor(s) {
  if (s >= 5) return 'var(--green-text)'
  if (s >= 4) return '#4ade80'
  if (s >= 3) return 'var(--amber-text)'
  return 'var(--text-tertiary)'
}

function CriteriaDots({ criteria }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {CRITERIA.map(c => (
        <div key={c.key} title={`${c.label}: ${c.tip}`}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: criteria[c.key] ? 'var(--green-text)' : 'var(--bg-tertiary)',
            border: `1px solid ${criteria[c.key] ? 'var(--green-text)' : 'var(--border-subtle)'}`,
          }} />
          <span style={{ fontSize: 7, fontWeight: 600, color: criteria[c.key] ? 'var(--green-text)' : 'var(--text-tertiary)' }}>
            {c.label.slice(0, 4).toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  )
}

function DetailPanel({ row, onAnalyze, onClose }) {
  const fr = row.floatRatio
  return (
    <div className="card" style={{ borderLeft: `3px solid ${scoreColor(row.score)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{row.symbol}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10, background: 'var(--bg-tertiary)', color: scoreColor(row.score) }}>
              {row.score}/5
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{row.shortName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{row.sector}{row.industry ? ` · ${row.industry}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-primary" style={{ fontSize: 10, padding: '3px 10px' }} onClick={() => onAnalyze(row.symbol)}>Open Analyzer</button>
          <button className="btn" style={{ fontSize: 10, padding: '3px 10px' }} onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Float Ratio hero metric */}
      {fr != null && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 14,
          background: floatRatioBg(fr), border: `1px solid ${floatRatioColor(fr)}40`,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Float Ratio — the MRAM Signal
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: floatRatioColor(fr) }}>
            {row.floatRatioPct != null ? `${row.floatRatioPct}%` : '—'}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 8 }}>of float traded today</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
            {fr >= 0.5
              ? '🔥 Extreme — >50% of float trading. Classic MRAM/short-squeeze setup.'
              : fr >= 0.1
              ? '⚡ Very High — >10% of float. Unusual demand overwhelming supply.'
              : fr >= 0.05
              ? '📈 Elevated — >5% of float. Worth watching closely.'
              : 'Normal trading activity.'}
          </div>
        </div>
      )}

      {/* Criteria */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 14 }}>
        {CRITERIA.map(c => {
          const passed = row.criteria[c.key]
          return (
            <div key={c.key} style={{
              padding: '8px 10px', borderRadius: 7, textAlign: 'center',
              background: passed ? 'rgba(74,222,128,0.1)' : 'var(--bg-tertiary)',
              border: `0.5px solid ${passed ? 'rgba(74,222,128,0.4)' : 'var(--border-subtle)'}`,
            }}>
              <div style={{ fontSize: 16, marginBottom: 3 }}>{passed ? '✅' : '⬜'}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: passed ? 'var(--green-text)' : 'var(--text-tertiary)' }}>{c.label}</div>
              <div style={{ fontSize: 8, color: 'var(--text-tertiary)', marginTop: 2 }}>{c.tip}</div>
            </div>
          )
        })}
      </div>

      {/* Key metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        {[
          { label: 'Price',           value: `$${row.price?.toFixed(2)}` },
          { label: '52-Week High',    value: `$${row.yearHigh?.toFixed(2)}` },
          { label: 'From High',       value: `${row.distFromHigh?.toFixed(1)}%↓`, color: row.nearHigh ? 'var(--green-text)' : undefined },
          { label: "Today's Change",  value: row.todayChangePct != null ? (row.todayChangePct >= 0 ? `+${row.todayChangePct.toFixed(2)}%` : `${row.todayChangePct.toFixed(2)}%`) : '—',
            color: row.todayChangePct > 0 ? 'var(--green-text)' : row.todayChangePct < 0 ? 'var(--red-text)' : undefined },
          { label: 'Float Shares',    value: row.floatFmt || '—', color: row.lowFloat ? 'var(--amber-text)' : undefined,
            tip: 'Tradeable shares. Under 100M = thin float. Thin = big moves on news.' },
          { label: 'Float Ratio',     value: fr != null ? `${row.floatRatioPct}%` : '—', color: floatRatioColor(fr),
            tip: "Today's volume ÷ float. >5% = elevated. >50% = potential squeeze." },
          { label: 'Vol Ratio',       value: `${row.volRatio}×`, color: row.volSurge ? 'var(--amber-text)' : undefined,
            tip: 'Today volume ÷ 3-month average.' },
          { label: 'Market Cap',      value: row.marketCap || '—',
            tip: 'Smaller cap = harder to move by institutions = bigger % swings.' },
        ].map(({ label, value, color, tip }) => (
          <div key={label} title={tip} style={{
            padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6,
            border: '0.5px solid var(--border-subtle)', cursor: tip ? 'help' : undefined,
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LowFloatMomentumScanner({ onAnalyze }) {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [selected,  setSelected]  = useState(null)
  const [lastScan,  setLastScan]  = useState(null)
  const [sortBy,    setSortBy]    = useState('score')

  async function runScan() {
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const res = await backendLowFloatMomentum()
      setData(res)
      setLastScan(new Date().toLocaleTimeString())
    } catch {
      setError('Scan failed — check that the backend is running')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runScan() }, [])

  const results = (data?.results || []).slice().sort((a, b) => {
    if (sortBy === 'score')      return b.score - a.score
    if (sortBy === 'floatRatio') return (b.floatRatio ?? -1) - (a.floatRatio ?? -1)
    if (sortBy === 'volRatio')   return b.volRatio - a.volRatio
    if (sortBy === 'change')     return (b.todayChangePct ?? -999) - (a.todayChangePct ?? -999)
    if (sortBy === 'float')      return (a.floatShares ?? Infinity) - (b.floatShares ?? Infinity)
    return b.score - a.score
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">⚡ Low Float Momentum Scanner</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Finds MRAM-type setups — thin float + volume surge = violent moves · {data?.count ?? 0} signals
          </span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.7 }}>
          MRAM moved 80%+ in a day because{' '}
          <strong style={{ color: 'var(--text-primary)' }}>50%+ of its float traded on a catalyst</strong>.
          {' '}Thin float stocks have very few shares available — even modest buying overwhelms sellers and gaps the price.
          {' '}The key signal is <strong style={{ color: 'var(--amber-text)' }}>Float Ratio</strong>: volume ÷ float shares.
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { label: '>50% float traded', color: 'var(--red-text)',   bg: 'rgba(239,68,68,0.1)',    desc: '🔥 Extreme — squeeze territory' },
            { label: '>10% float traded', color: '#f97316',           bg: 'rgba(249,115,22,0.1)',   desc: '⚡ Very High — big demand surge' },
            { label: '>5% float traded',  color: 'var(--amber-text)', bg: 'rgba(251,191,36,0.08)', desc: '📈 Elevated — watch closely' },
          ].map(({ label, color, bg, desc }) => (
            <div key={label} style={{ padding: '5px 10px', borderRadius: 6, background: bg, border: `0.5px solid ${color}40`, fontSize: 10 }}>
              <span style={{ color, fontWeight: 700 }}>{label}</span>
              <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>{desc}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={runScan} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? 'Scanning...' : '🔄 Scan Now'}
          </button>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ fontSize: 11, padding: '5px 8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}
          >
            <option value="score">Sort: Score</option>
            <option value="floatRatio">Sort: Float Ratio (key signal)</option>
            <option value="volRatio">Sort: Volume Surge</option>
            <option value="change">Sort: Today's Move</option>
            <option value="float">Sort: Smallest Float</option>
          </select>

          {lastScan && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Scanned {lastScan}</span>}
        </div>

        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 'var(--r-md)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Results table */}
      {results.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th title="How many of the 5 low-float criteria are met">Score</th>
                  <th title="5 criteria dots: Float · F.Surge · Volume · Near Hi · Momo">Criteria</th>
                  <th title="Current price">Price</th>
                  <th title="Today's % change vs previous close" style={{ color: 'var(--amber-text)' }}>Today</th>
                  <th title="Float shares — tradeable supply. Under 100M = thin float.">Float</th>
                  <th
                    title="Today's volume as % of float. The primary MRAM signal. >5% = elevated, >50% = extreme."
                    style={{ color: 'var(--amber-text)' }}
                  >
                    <div>Float Ratio</div>
                    <div style={{ fontSize: 8, fontWeight: 400, color: 'var(--text-tertiary)', marginTop: 2 }}>vol ÷ float</div>
                  </th>
                  <th title="Today's volume ÷ 3-month average">Vol Ratio</th>
                  <th title="Distance below 52-week high">From High</th>
                  <th title="Market cap — smaller = more volatile">Mkt Cap</th>
                  <th title="Sector">Sector</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(row => (
                  <React.Fragment key={row.symbol}>
                    <tr
                      style={{ cursor: 'pointer', background: selected?.symbol === row.symbol ? 'var(--bg-tertiary)' : undefined }}
                      onClick={() => setSelected(s => s?.symbol === row.symbol ? null : row)}
                    >
                      <td>
                        <strong style={{ color: scoreColor(row.score), fontSize: 13 }}>{row.symbol}</strong>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.shortName}
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: scoreColor(row.score) }}>
                          {row.score}/5
                        </span>
                      </td>

                      <td><CriteriaDots criteria={row.criteria} /></td>

                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        ${row.price?.toFixed(2)}
                      </td>

                      <td style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                        color: row.todayChangePct > 0 ? 'var(--green-text)' : row.todayChangePct < 0 ? 'var(--red-text)' : 'var(--text-tertiary)',
                      }}>
                        {row.todayChangePct != null ? (row.todayChangePct >= 0 ? '+' : '') + row.todayChangePct.toFixed(2) + '%' : '—'}
                      </td>

                      <td style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: row.lowFloat ? 'var(--amber-text)' : 'var(--text-primary)',
                        fontWeight: row.lowFloat ? 700 : 400,
                      }}>
                        {row.floatFmt || '—'}
                      </td>

                      <td>
                        {row.floatRatio != null ? (
                          <div style={{
                            display: 'inline-block', padding: '3px 8px', borderRadius: 5,
                            background: floatRatioBg(row.floatRatio),
                            border: `0.5px solid ${floatRatioColor(row.floatRatio)}40`,
                          }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: floatRatioColor(row.floatRatio) }}>
                              {row.floatRatioPct}%
                            </span>
                          </div>
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

                      <td style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: row.nearHigh ? 'var(--green-text)' : 'var(--text-tertiary)',
                      }}>
                        {row.distFromHigh?.toFixed(1)}%↓
                      </td>

                      <td style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        {row.marketCap || '—'}
                      </td>

                      <td style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        {row.sector}
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
                        <td colSpan={12} style={{ padding: 0, background: 'var(--bg-secondary)' }}>
                          <div style={{ padding: '12px 14px', borderTop: `2px solid ${scoreColor(row.score)}` }}>
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
          <div style={{ fontSize: 24, marginBottom: 10 }}>⚡</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Scanning {35}+ small-cap stocks for low-float setups…</div>
          <div style={{ fontSize: 11 }}>Fetching float data takes ~30–60 seconds.</div>
        </div>
      )}

      {!loading && !error && results.length === 0 && data && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>⚡</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>No low-float momentum setups found right now</div>
          <div style={{ fontSize: 11 }}>
            MRAM-type moves are rare — they need a catalyst (news, earnings beat, partnership) on a thin-float stock.
            Check back during market hours when volume data is live.
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          How to read this scanner
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {[
            { icon: '📦', col: 'Float',       desc: 'Total tradeable shares. <50M = explosive; <20M = violent. MRAM had ~20M float.' },
            { icon: '🔥', col: 'Float Ratio', desc: 'Today\'s volume ÷ float. If 50% of all shares changed hands, sellers are overwhelmed.' },
            { icon: '⚡', col: 'Vol Ratio',   desc: '>2× average = unusual interest. Combined with thin float = fuel for a big move.' },
            { icon: '📈', col: 'Today',       desc: 'The move already happening. A 3%+ day on a thin float can accelerate fast.' },
            { icon: '🏔',  col: 'From High',  desc: 'Context. Near high = breakout mode. Far from high = recovery play.' },
            { icon: '💰', col: 'Mkt Cap',     desc: '<$500M = micro-cap. Easier for retail flow to move. Riskier but bigger % moves.' },
          ].map(({ icon, col, desc }) => (
            <div key={col} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>{col}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}> — {desc}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>How to use:</strong>
          {' '}Sort by <strong>Float Ratio</strong>. Any stock trading >10% of its float is being aggressively accumulated.
          {' '}Cross-reference with news (earnings beat, FDA approval, partnership). If float is under 50M <em>and</em> float ratio is over 10%, that is the setup.
          {' '}These moves can last 1–3 days before the float normalizes.
        </div>
      </div>
    </div>
  )
}