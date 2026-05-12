import { useState, useEffect } from 'react'
import { backendOptionsDecoder } from '../api/backend.js'

// Parse "SPY 825C 09/30/2026" or "SPY 825P 2026-09-30" etc.
function parseNotation(raw) {
  const s = raw.trim().toUpperCase()
  const re = /^([A-Z.^]+)\s+(\d+(?:\.\d+)?)\s*(C|P)\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/
  const m = s.match(re)
  if (!m) return null
  const [, symbol, strikeStr, typeChar, dateStr] = m
  const strike = parseFloat(strikeStr)
  const optType = typeChar === 'C' ? 'call' : 'put'
  let expiry = dateStr
  if (dateStr.includes('/')) {
    const [mm, dd, yyyy] = dateStr.split('/')
    expiry = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
  }
  return { symbol, strike, optType, expiry }
}

function fmt$(v) {
  if (v == null) return '—'
  return `$${v.toFixed(2)}`
}

function fmtPct(v) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

function pnlColor(pnl) {
  if (pnl > 0)  return 'var(--green-text)'
  if (pnl < 0)  return 'var(--red-text)'
  return 'var(--text-tertiary)'
}

function pnlBg(pnl, maxAbs) {
  if (!maxAbs || pnl == null) return 'var(--bg-tertiary)'
  const intensity = Math.min(Math.abs(pnl) / maxAbs, 1)
  if (pnl > 0) return `rgba(74,222,128,${0.08 + intensity * 0.25})`
  if (pnl < 0) return `rgba(248,113,113,${0.08 + intensity * 0.25})`
  return 'var(--bg-tertiary)'
}

const GREEKS = [
  {
    key:   'delta',
    label: 'Delta',
    icon:  'Δ',
    color: 'var(--green-text)',
    what:  'How much the option moves per $1 move in the stock.',
    read:  (v) => `For every $1 ${v > 0 ? 'up' : 'down'} in the stock, this option gains/loses $${(Math.abs(v) * 100).toFixed(0)} per contract.`,
    scale: 'ranges 0 → 1 for calls, -1 → 0 for puts. 0.5 = ATM.',
  },
  {
    key:   'thetaDay',
    label: 'Theta',
    icon:  'Θ',
    color: 'var(--red-text)',
    what:  'How much value the option loses per day just by sitting still (time decay).',
    read:  (v) => `You lose ${fmt$(Math.abs(v))} every calendar day you hold this contract, even if the stock doesn't move.`,
    scale: 'always negative. Accelerates as expiry approaches.',
  },
  {
    key:   'gammaPoint',
    label: 'Gamma',
    icon:  'Γ',
    color: 'var(--amber-text)',
    what:  'How fast delta changes. High gamma = delta accelerates as stock moves your way.',
    read:  (v) => `Delta shifts by ${v?.toFixed(4)} per $1 stock move. Near expiry gamma explodes — small moves = big delta changes.`,
    scale: 'highest at ATM near expiry. Low for deep ITM/OTM or far from expiry.',
  },
  {
    key:   'vegaPct',
    label: 'Vega',
    icon:  'V',
    color: '#818cf8',
    what:  'How much the option gains/loses per 1% increase in implied volatility (IV).',
    read:  (v) => `If IV rises 1%, this contract gains ${fmt$(Math.abs(v))}. If IV crashes (like after earnings), you can lose money even if the stock moves your way.`,
    scale: 'highest for ATM, long-dated options. LEAPS are very vega-sensitive.',
  },
]

export default function OptionsDecoder({ initialNotation }) {
  const [input,    setInput]    = useState(initialNotation || 'SPY 825C 09/30/2026')
  const [parsed,   setParsed]   = useState(() => parseNotation(initialNotation || 'SPY 825C 09/30/2026'))
  const [parseErr, setParseErr] = useState(null)
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  // Auto-decode when launched from the flow scanner
  useEffect(() => {
    if (initialNotation && parseNotation(initialNotation)) decode()
  }, [initialNotation])  // eslint-disable-line

  function handleInput(val) {
    setInput(val)
    const p = parseNotation(val)
    setParsed(p)
    setParseErr(p ? null : (val.trim() ? 'Could not parse — try: SPY 825C 09/30/2026' : null))
  }

  async function decode() {
    const p = parseNotation(input)
    if (!p) { setParseErr('Could not parse — try: SPY 825C 09/30/2026'); return }
    setLoading(true); setError(null); setData(null)
    try {
      const res = await backendOptionsDecoder(p)
      setData(res)
    } catch (e) {
      setError(e.message || 'Failed to decode contract')
    } finally {
      setLoading(false)
    }
  }

  // Max absolute P&L across entire matrix (for color scaling)
  const maxAbs = data ? Math.max(...data.matrix.flatMap(r => r.cells.map(c => Math.abs(c.pnl))), 1) : 1

  const moneynessColor = data?.moneyness === 'ITM' ? 'var(--green-text)'
                       : data?.moneyness === 'OTM' ? 'var(--red-text)'
                       : 'var(--amber-text)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Input card */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">📐 Options Contract Decoder</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Paste any options notation — see every value explained + future price scenarios
          </span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.7 }}>
          Type an options contract like{' '}
          <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>
            SPY 825C 09/30/2026
          </code>{' '}
          and this tool will decode every value: premium, Greeks, breakeven, and a scenario table
          showing what the contract is worth at any future price and date.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={input}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && decode()}
            placeholder="SPY 825C 09/30/2026"
            style={{
              flex: 1, minWidth: 220, maxWidth: 340,
              padding: '7px 10px', fontSize: 13, fontFamily: 'var(--font-mono)',
              background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              border: `1px solid ${parseErr ? 'var(--red-text)' : parsed ? 'var(--green-text)' : 'var(--border-subtle)'}`,
              borderRadius: 6, outline: 'none',
            }}
          />
          <button className="btn btn-primary" onClick={decode} disabled={loading || !parsed} style={{ fontSize: 11 }}>
            {loading ? 'Decoding…' : '🔍 Decode'}
          </button>
        </div>

        {parsed && !parseErr && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'Ticker',  val: parsed.symbol },
              { label: 'Strike',  val: `$${parsed.strike}` },
              { label: 'Type',    val: parsed.optType === 'call' ? '📈 Call' : '📉 Put' },
              { label: 'Expiry',  val: parsed.expiry },
            ].map(({ label, val }) => (
              <div key={label} style={{ padding: '3px 10px', borderRadius: 5, background: 'var(--bg-tertiary)', fontSize: 10 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>{label}: </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{val}</span>
              </div>
            ))}
          </div>
        )}
        {parseErr && <div style={{ marginTop: 6, fontSize: 10, color: 'var(--red-text)' }}>{parseErr}</div>}
        {error   && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 5 }}>{error}</div>}
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📐</div>
          <div style={{ fontSize: 13 }}>Fetching contract data and computing Greeks…</div>
        </div>
      )}

      {data && !loading && (<>

        {/* Contract summary */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {data.symbol} ${data.strike} {data.optType === 'call' ? 'Call' : 'Put'}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                  color: moneynessColor, background: 'var(--bg-tertiary)',
                }}>
                  {data.moneyness}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Expires {data.expiry} · {data.daysLeft} days left · Spot: {fmt$(data.spot)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {fmt$(data.premium)}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>per share</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                ${(data.premium * 100).toFixed(0)} per contract (100 shares)
              </div>
            </div>
          </div>

          {/* Key stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            {[
              { label: 'Moneyness', val: data.moneyness, color: moneynessColor,
                tip: data.optType === 'call'
                  ? `Stock is ${fmt$(data.spot)}. Strike is ${fmt$(data.strike)}. ${data.moneyness === 'OTM' ? `Stock needs to rise ${fmtPct(data.pctToStrike)} to reach strike.` : 'Already in the money.'}`
                  : `Stock is ${fmt$(data.spot)}. Strike is ${fmt$(data.strike)}. ${data.moneyness === 'OTM' ? `Stock needs to fall ${fmtPct(data.pctToStrike)} to reach strike.` : 'Already in the money.'}` },
              { label: '% to Strike',  val: fmtPct(data.pctToStrike),
                color: data.moneyness === 'OTM' ? 'var(--red-text)' : 'var(--green-text)',
                tip: `The stock must move ${fmtPct(data.pctToStrike)} for this option to be in-the-money at expiry.` },
              { label: 'Breakeven',    val: fmt$(data.breakeven),
                tip: `At expiry, the stock must be above ${fmt$(data.breakeven)} (${fmtPct(data.breakevenPct)} from here) for this trade to profit.` },
              { label: 'Implied Vol',  val: `${data.iv}%`,
                tip: `Implied Volatility: the market's expectation of how much the stock will move. Higher IV = more expensive options. ${data.iv > 30 ? 'High IV — options are pricey.' : 'Normal IV range.'}` },
              { label: 'Bid / Ask',    val: data.bid && data.ask ? `${fmt$(data.bid)} / ${fmt$(data.ask)}` : '—',
                tip: 'The spread between what buyers will pay and sellers will accept. Wide spread = illiquid contract.' },
              { label: 'Volume',       val: data.volume?.toLocaleString() || '—',
                tip: 'Number of contracts traded today. Higher = more liquid.' },
              { label: 'Open Interest', val: data.openInterest?.toLocaleString() || '—',
                tip: 'Total open contracts. Large OI = institutional interest in this strike.' },
              { label: 'BS Price',     val: fmt$(data.bsPrice),
                tip: `Black-Scholes theoretical fair value. Market price is ${fmt$(data.marketPrice || data.premium)}. ${data.marketPrice && Math.abs(data.marketPrice - data.bsPrice) > 0.5 ? 'Difference may reflect supply/demand or stale last print.' : 'Close to fair value.'}` },
            ].map(({ label, val, color, tip }) => (
              <div key={label} title={tip} style={{
                padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6,
                border: '0.5px solid var(--border-subtle)', cursor: tip ? 'help' : undefined,
              }}>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Greeks */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            The Greeks — what each number tells you
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {GREEKS.map(g => {
              const val = data[g.key]
              return (
                <div key={g.key} style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: 'var(--bg-tertiary)', border: `1px solid ${g.color}30`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: g.color }}>{g.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{g.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: g.color, marginLeft: 'auto' }}>
                      {val != null ? (val >= 0 ? '+' : '') + val : '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6, lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>What it is:</strong> {g.what}
                  </div>
                  <div style={{ fontSize: 10, color: g.color, lineHeight: 1.5, padding: '5px 8px', background: `${g.color}10`, borderRadius: 5 }}>
                    <strong>Right now:</strong> {val != null ? g.read(val) : 'No data available.'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 6, fontStyle: 'italic' }}>{g.scale}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Earnings */}
        {(() => {
          const er = data.earnings
          if (!er) return (
            <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 20 }}>📅</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Earnings Date</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>No upcoming earnings date found for {data.symbol}.</div>
              </div>
            </div>
          )

          const warn  = er.beforeExpiry   // earnings falls within option's life
          const phase = er.daysAway <= 7  ? { label: '⚡ This week',   color: 'var(--red-text)',   bg: 'rgba(239,68,68,0.1)'    }
                      : er.daysAway <= 14 ? { label: '🔥 Very soon',   color: '#f97316',           bg: 'rgba(249,115,22,0.1)'   }
                      : er.daysAway <= 30 ? { label: '⭐ This month',  color: 'var(--amber-text)', bg: 'rgba(251,191,36,0.08)'  }
                      :                    { label: '📅 Upcoming',     color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)' }

          return (
            <div className="card" style={{ borderLeft: `3px solid ${warn ? 'var(--amber-text)' : 'var(--border-subtle)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>📅</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Earnings Date</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                  color: phase.color, background: phase.bg, marginLeft: 4,
                }}>
                  {phase.label}
                </span>
                {warn && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                    color: 'var(--amber-text)', background: 'rgba(251,191,36,0.1)',
                    border: '0.5px solid rgba(251,191,36,0.4)',
                  }}>
                    ⚠️ Before expiry
                  </span>
                )}
              </div>

              {/* Key stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Earnings Date',     val: er.date,                              color: phase.color },
                  { label: 'Days Until Earnings', val: `${er.daysAway} days`,              color: phase.color },
                  { label: 'vs Option Expiry',  val: er.beforeExpiry ? 'BEFORE expiry ⚠️' : 'After expiry ✓',
                    color: er.beforeExpiry ? 'var(--amber-text)' : 'var(--green-text)' },
                  { label: 'Expected ±Move',    val: data.expectedMovePct != null ? `±${data.expectedMovePct}%` : '—',
                    color: 'var(--text-primary)',
                    tip: `IV-implied 1-sigma move from now to earnings. There is a ~68% chance the stock stays within this range.` },
                ].map(({ label, val, color, tip }) => (
                  <div key={label} title={tip} style={{
                    padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6,
                    border: '0.5px solid var(--border-subtle)', cursor: tip ? 'help' : undefined,
                  }}>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)' }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Contextual explanation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {er.beforeExpiry ? (
                  <>
                    <div style={{ padding: '10px 12px', borderRadius: 7, background: 'rgba(251,191,36,0.08)', border: '0.5px solid rgba(251,191,36,0.3)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      <strong style={{ color: 'var(--amber-text)' }}>⚠️ Earnings falls within this option's life ({er.date}).</strong>
                      {' '}This matters a lot. Before earnings, IV inflates (options get expensive).
                      Right after the report, IV collapses — this is called <strong style={{ color: 'var(--text-primary)' }}>IV crush</strong>.
                      Even if {data.symbol} moves the right direction, IV crush can wipe out your gains or turn a winning move into a loss.
                    </div>
                    <div style={{ padding: '10px 12px', borderRadius: 7, background: 'var(--bg-tertiary)', border: '0.5px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>What to watch:</strong>
                      {' '}The market expects a <strong style={{ color: 'var(--amber-text)' }}>±{data.expectedMovePct}%</strong> move on earnings (1-sigma, based on current IV of {data.iv}%).
                      If {data.symbol} moves more than that, your option likely profits despite IV crush.
                      If it moves less, IV crush will hurt the position even with a move in your direction.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Before earnings (hold through)',
                          pro:  'If the stock beats and gaps up big, a call gains both from delta and the move exceeding the expected range.',
                          con:  'IV crush post-earnings can destroy 30–60% of option value overnight, even on a correct directional call.' },
                        { label: 'Close before earnings (avoid IV crush)',
                          pro:  'Lock in any gains from IV expansion into the event. Avoid binary risk.',
                          con:  'Miss the actual earnings move. If the stock gaps up 20%, you get none of it after closing.' },
                      ].map(({ label, pro, con }) => (
                        <div key={label} style={{ padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 6, border: '0.5px solid var(--border-subtle)', fontSize: 10 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{label}</div>
                          <div style={{ color: 'var(--green-text)', marginBottom: 4 }}>✓ {pro}</div>
                          <div style={{ color: 'var(--red-text)' }}>✗ {con}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '10px 12px', borderRadius: 7, background: 'rgba(74,222,128,0.07)', border: '0.5px solid rgba(74,222,128,0.25)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <strong style={{ color: 'var(--green-text)' }}>✓ Earnings falls after this option expires ({er.date}).</strong>
                    {' '}The earnings event will not affect this contract — it expires before the report.
                    You won't benefit from an earnings pop, but you also won't be exposed to IV crush or a gap down.
                    Price this option purely on delta (directional move) and theta (time decay).
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Scenario matrix */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              📊 Scenario Matrix — what is this contract worth at any price & date?
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Each cell shows the contract value (100 shares) and P&L vs. your cost of{' '}
              <strong style={{ color: 'var(--text-primary)' }}>${(data.premium * 100).toFixed(0)}</strong>.
              Green = profit · Red = loss · Color intensity = magnitude.
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, borderBottom: '0.5px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>
                    Time left ↓ / {data.symbol} price →
                  </th>
                  {data.spotCols.map(sp => (
                    <th key={sp} style={{
                      padding: '8px 10px', textAlign: 'center',
                      fontSize: 10, fontFamily: 'var(--font-mono)',
                      borderBottom: '0.5px solid var(--border-subtle)',
                      color: sp === data.strike ? 'var(--amber-text)' : sp >= data.breakeven ? 'var(--green-text)' : 'var(--text-tertiary)',
                      fontWeight: sp === data.strike || sp >= data.breakeven ? 700 : 400,
                      background: sp === data.strike ? 'rgba(251,191,36,0.06)' : undefined,
                    }}>
                      ${sp}
                      {sp === data.strike && <div style={{ fontSize: 8, opacity: 0.7 }}>strike</div>}
                      {sp === data.breakeven && sp !== data.strike && <div style={{ fontSize: 8, color: 'var(--green-text)', opacity: 0.8 }}>b/e</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((row, ri) => (
                  <tr key={ri}>
                    <td style={{
                      padding: '8px 12px', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap',
                      color: row.days === 0 ? 'var(--amber-text)' : 'var(--text-secondary)',
                      borderBottom: '0.5px solid var(--border-subtle)',
                      background: 'var(--bg-secondary)',
                    }}>
                      {row.label}
                    </td>
                    {row.cells.map((cell, ci) => (
                      <td key={ci} style={{
                        padding: '7px 10px', textAlign: 'center',
                        background: pnlBg(cell.pnl, maxAbs),
                        borderBottom: '0.5px solid var(--border-subtle)',
                        borderLeft: cell.spot === data.strike ? '1px solid rgba(251,191,36,0.3)' : undefined,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          ${cell.value.toFixed(0)}
                        </div>
                        <div style={{ fontSize: 9, color: pnlColor(cell.pnl) }}>
                          {cell.pnl >= 0 ? '+' : ''}{cell.pnl.toFixed(0)}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 16px', fontSize: 10, color: 'var(--text-tertiary)', borderTop: '0.5px solid var(--border-subtle)' }}>
            Scenario prices computed using Black-Scholes with current IV ({data.iv}%). P&L assumes you paid ${(data.premium * 100).toFixed(0)} per contract.
            Actual results will differ if IV changes (vega risk).
          </div>
        </div>

        {/* How to predict / education */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            How to predict future values
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {[
              { icon: '📈', title: 'Use the scenario matrix',
                body: 'Find the row closest to your target date. Find the column closest to your expected stock price. That cell shows the contract\'s estimated value. The matrix is your prediction engine.' },
              { icon: 'Δ',  title: 'Delta approximation (quick)',
                body: `For small moves, multiply the stock's move by delta × 100. Example: if ${data.symbol} rises $10 and delta is ${data.delta ?? '—'}, the contract gains ~$${data.delta ? (data.delta * 10 * 100).toFixed(0) : '—'}.` },
              { icon: 'Θ',  title: 'Theta erodes value daily',
                body: `Without any stock move, this contract loses $${data.thetaDay != null ? Math.abs(data.thetaDay).toFixed(2) : '—'} per day. Over 30 days that's $${data.thetaDay != null ? (Math.abs(data.thetaDay) * 30).toFixed(0) : '—'} lost to time alone. This is why most options expire worthless.` },
              { icon: 'V',  title: 'IV crush changes everything',
                body: `Around earnings, IV spikes (options get expensive). After earnings, IV collapses (options get cheap) — even if the stock moves your way. This contract gains/loses $${data.vegaPct ?? '—'} per 1% IV move. Watch IV before buying.` },
              { icon: '💡', title: 'OTM options need big moves',
                body: `This contract is ${data.pctToStrike?.toFixed(1)}% OTM. The stock must move ${fmtPct(data.breakevenPct)} just to break even at expiry. That's why OTM options are cheap — they're low-probability lottery tickets.` },
              { icon: '📅', title: 'Time is your enemy',
                body: `You have ${data.daysLeft} days. As expiry approaches, theta accelerates. A contract worth $${(data.premium * 100).toFixed(0)} today loses value every day — even on weekends. Long-dated options (LEAPS) decay slower.` },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '0.5px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>

      </>)}

      {/* Quick reference — always visible */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          How to read options notation
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', marginBottom: 10, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
          SPY &nbsp;<span style={{ color: '#f97316' }}>825</span><span style={{ color: 'var(--green-text)' }}>C</span>&nbsp;<span style={{ color: 'var(--amber-text)' }}>09/30/2026</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {[
            { part: 'SPY', color: 'var(--text-primary)', label: 'Ticker', desc: 'The underlying stock or ETF. S&P 500 ETF in this case.' },
            { part: '825', color: '#f97316', label: 'Strike Price', desc: 'The price you have the right to buy (call) or sell (put) the stock at.' },
            { part: 'C / P', color: 'var(--green-text)', label: 'Call or Put', desc: 'C = right to BUY (bullish). P = right to SELL (bearish).' },
            { part: '09/30/2026', color: 'var(--amber-text)', label: 'Expiration', desc: 'The date the option expires. After this date the contract is worthless.' },
          ].map(({ part, color, label, desc }) => (
            <div key={label} style={{ padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 6, border: '0.5px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <code style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{part}</code>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}