import { useState, useMemo } from 'react'

function InputRow({ label, value, onChange, prefix, suffix, step = 'any', min, max, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {prefix && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{prefix}</span>}
        <input
          type="number" value={value} step={step} min={min} max={max}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '6px 8px' }}
        />
        {suffix && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{suffix}</span>}
      </div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{sub}</div>}
    </div>
  )
}

function ResultCard({ label, value, color, sub, big }) {
  return (
    <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '0.5px solid var(--border-subtle)' }}>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function RRBar({ ratio }) {
  if (!ratio || ratio <= 0) return null
  const capped = Math.min(ratio, 5)
  const color  = ratio >= 2 ? 'var(--green-text)' : ratio >= 1 ? 'var(--amber-text)' : 'var(--red-text)'
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3 }}>
        <span>Risk:Reward</span><span style={{ color }}>{ratio.toFixed(2)}R</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${(capped / 5) * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  )
}

// ── Stock Position Sizer ──────────────────────────────────────────────────────
function StockSizer() {
  const [account,  setAccount]  = useState(50000)
  const [riskPct,  setRiskPct]  = useState(2)
  const [entry,    setEntry]    = useState(100)
  const [stop,     setStop]     = useState(95)
  const [target,   setTarget]   = useState(110)

  const calc = useMemo(() => {
    if (!account || !riskPct || !entry || !stop || entry <= stop) return null
    const maxRiskDollar = account * (riskPct / 100)
    const riskPerShare  = entry - stop
    const shares        = Math.floor(maxRiskDollar / riskPerShare)
    const positionSize  = shares * entry
    const actualRisk    = shares * riskPerShare
    const positionPct   = (positionSize / account) * 100

    let rrRatio = null, reward = null, targetReturn = null
    if (target && target > entry) {
      reward      = shares * (target - entry)
      rrRatio     = (target - entry) / riskPerShare
      targetReturn = ((target - entry) / entry) * 100
    }

    return { shares, positionSize, actualRisk, positionPct, rrRatio, reward, targetReturn, riskPerShare, maxRiskDollar }
  }, [account, riskPct, entry, stop, target])

  const valid = calc !== null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Inputs</div>

        <InputRow label="Account Size"  value={account}  onChange={setAccount}  prefix="$" step={1000} min={0} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Risk per trade — {riskPct}%  (${account ? ((account * riskPct) / 100).toFixed(0) : 0} max loss)
          </label>
          <input type="range" min={0.5} max={5} step={0.5} value={riskPct}
            onChange={e => setRiskPct(Number(e.target.value))}
            style={{ width: '100%', accentColor: riskPct > 3 ? 'var(--red-text)' : 'var(--blue)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-tertiary)' }}>
            <span>0.5% (safe)</span><span>3% (aggressive)</span><span>5% (risky)</span>
          </div>
        </div>

        <InputRow label="Entry Price"  value={entry}  onChange={setEntry}  prefix="$" step={0.01} min={0} />
        <InputRow label="Stop Price"   value={stop}   onChange={setStop}   prefix="$" step={0.01} min={0} sub="Where you exit if wrong" />
        <InputRow label="Target Price" value={target} onChange={setTarget} prefix="$" step={0.01} min={0} sub="Optional — calculates R:R ratio" />

        {entry && stop && entry <= stop && (
          <div style={{ fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 6 }}>
            Stop must be below entry price for a long position
          </div>
        )}
      </div>

      {/* Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Results</div>

        {!valid ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 20, textAlign: 'center' }}>
            Fill in valid inputs to see position size
          </div>
        ) : (
          <>
            <ResultCard label="Shares to Buy"    value={calc.shares.toLocaleString()}             big color="var(--blue)" />
            <ResultCard label="Position Size"    value={`$${calc.positionSize.toLocaleString()}`} sub={`${calc.positionPct.toFixed(1)}% of account`} />
            <ResultCard label="Max Dollar Risk"  value={`$${calc.actualRisk.toFixed(0)}`}         color="var(--red-text)" sub={`$${calc.riskPerShare.toFixed(2)} per share`} />
            {calc.rrRatio && (
              <>
                <ResultCard label="Potential Reward" value={`$${calc.reward?.toFixed(0)}`}        color="var(--green-text)" sub={`+${calc.targetReturn?.toFixed(1)}% return`} />
                <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '0.5px solid var(--border-subtle)' }}>
                  <RRBar ratio={calc.rrRatio} />
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {calc.rrRatio >= 2 ? '✓ Good setup — reward ≥ 2× risk' : calc.rrRatio >= 1 ? '⚠ Marginal — consider wider target' : '✗ Poor R:R — not recommended'}
                  </div>
                </div>
              </>
            )}

            {/* Position summary */}
            <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '0.5px solid var(--border-subtle)', fontSize: 11, lineHeight: 1.8 }}>
              <strong>Trade summary:</strong> Buy <span style={{ color: 'var(--blue)', fontWeight: 700 }}>{calc.shares} shares</span> of stock at ${entry},
              stop at ${stop} (−${calc.riskPerShare.toFixed(2)}/share).
              {calc.rrRatio ? ` Target ${calc.rrRatio.toFixed(1)}R at $${target}.` : ''}
              {' '}Max loss: <span style={{ color: 'var(--red-text)', fontWeight: 700 }}>${calc.actualRisk.toFixed(0)}</span> ({riskPct}% of account).
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Options Position Sizer ────────────────────────────────────────────────────
function OptionsSizer() {
  const [account,   setAccount]   = useState(50000)
  const [riskPct,   setRiskPct]   = useState(2)
  const [premium,   setPremium]   = useState(3.50)
  const [entry,     setEntry]     = useState(100)
  const [strike,    setStrike]    = useState(105)
  const [dte,       setDte]       = useState(14)
  const [target,    setTarget]    = useState(120)
  const [optType,   setOptType]   = useState('call')

  const calc = useMemo(() => {
    if (!account || !riskPct || !premium || premium <= 0) return null
    const maxRiskDollar = account * (riskPct / 100)
    const costPerContract = premium * 100
    const contracts = Math.floor(maxRiskDollar / costPerContract)
    const totalCost = contracts * costPerContract
    const breakeven = optType === 'call' ? strike + premium : strike - premium
    const breakevenPct = entry ? ((breakeven - entry) / entry) * 100 : null

    let potentialProfit = null, rrRatio = null
    if (target && entry) {
      const intrinsicAtTarget = optType === 'call'
        ? Math.max(0, target - strike)
        : Math.max(0, strike - target)
      const gainPerContract = (intrinsicAtTarget - premium) * 100
      potentialProfit = gainPerContract * contracts
      rrRatio = gainPerContract > 0 ? (intrinsicAtTarget - premium) / premium : null
    }

    return { contracts, totalCost, breakeven, breakevenPct, potentialProfit, rrRatio, maxRiskDollar, costPerContract }
  }, [account, riskPct, premium, entry, strike, dte, target, optType])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Inputs</div>

        <div style={{ display: 'flex', gap: 8 }}>
          {['call', 'put'].map(t => (
            <button key={t} className="btn" onClick={() => setOptType(t)}
              style={{ flex: 1, fontWeight: 700, fontSize: 12,
                background: optType === t ? (t === 'call' ? 'var(--green-dim)' : 'var(--red-dim)') : 'var(--bg-tertiary)',
                color: optType === t ? (t === 'call' ? 'var(--green-text)' : 'var(--red-text)') : 'var(--text-secondary)',
                border: `0.5px solid ${optType === t ? (t === 'call' ? 'var(--green-text)' : 'var(--red-text)') : 'var(--border-subtle)'}` }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <InputRow label="Account Size"      value={account}  onChange={setAccount}  prefix="$" step={1000} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Risk per trade — {riskPct}%  (${account ? ((account * riskPct) / 100).toFixed(0) : 0})
          </label>
          <input type="range" min={0.5} max={5} step={0.5} value={riskPct}
            onChange={e => setRiskPct(Number(e.target.value))}
            style={{ width: '100%', accentColor: riskPct > 3 ? 'var(--red-text)' : 'var(--blue)' }} />
        </div>
        <InputRow label="Option Premium"    value={premium}  onChange={setPremium}  prefix="$" step={0.05} min={0} sub="Per share (multiply × 100 for contract cost)" />
        <InputRow label="Stock Price"       value={entry}    onChange={setEntry}    prefix="$" step={0.01} />
        <InputRow label="Strike Price"      value={strike}   onChange={setStrike}   prefix="$" step={1} />
        <InputRow label="Days to Expiry"    value={dte}      onChange={setDte}      suffix="days" step={1} min={1} />
        <InputRow label="Price Target"      value={target}   onChange={setTarget}   prefix="$" step={0.01} sub="Optional — for P&L estimate" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Results</div>

        {!calc ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 20, textAlign: 'center' }}>Fill in valid inputs</div>
        ) : (
          <>
            <ResultCard label="Contracts to Buy"  value={calc.contracts} big color="var(--blue)" />
            <ResultCard label="Total Cost"        value={`$${calc.totalCost.toFixed(0)}`}     sub={`$${calc.costPerContract.toFixed(0)} per contract`} />
            <ResultCard label="Max Loss"          value={`$${calc.totalCost.toFixed(0)}`}     color="var(--red-text)" sub="Full premium if expires worthless" />
            <ResultCard label="Breakeven at Exp." value={`$${calc.breakeven.toFixed(2)}`}
              color={calc.breakevenPct && Math.abs(calc.breakevenPct) < 5 ? 'var(--amber-text)' : 'var(--text-primary)'}
              sub={calc.breakevenPct != null ? `${calc.breakevenPct > 0 ? '+' : ''}${calc.breakevenPct.toFixed(1)}% from current` : undefined}
            />
            {calc.potentialProfit != null && calc.rrRatio != null && (
              <>
                <ResultCard
                  label="Potential Profit (at target)"
                  value={`${calc.potentialProfit >= 0 ? '+' : ''}$${calc.potentialProfit.toFixed(0)}`}
                  color={calc.potentialProfit >= 0 ? 'var(--green-text)' : 'var(--red-text)'}
                />
                <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '0.5px solid var(--border-subtle)' }}>
                  <RRBar ratio={calc.rrRatio} />
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {calc.rrRatio >= 2 ? '✓ Good setup — reward ≥ 2× risk' : calc.rrRatio >= 1 ? '⚠ Marginal setup' : '✗ Poor R:R — not recommended'}
                  </div>
                </div>
              </>
            )}
            <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '0.5px solid var(--border-subtle)', fontSize: 11, lineHeight: 1.8 }}>
              <strong>Trade summary:</strong> Buy <span style={{ color: optType === 'call' ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 700 }}>
                {calc.contracts} {optType.toUpperCase()} contract{calc.contracts !== 1 ? 's' : ''}
              </span>, ${strike} strike, {dte}d to expiry, at ${premium}/share.
              Total cost: <span style={{ color: 'var(--red-text)', fontWeight: 700 }}>${calc.totalCost.toFixed(0)}</span> ({riskPct}% of account).
              Breakeven: ${calc.breakeven.toFixed(2)}.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function PositionSizer() {
  const [mode, setMode] = useState('stock')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">⚖️ Position Sizer & Risk Calculator</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Never risk more than you plan · size based on stop distance
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>
          The #1 rule in trading: decide your max loss before entering. This calculator tells you exactly how many shares or contracts to buy based on your account size and risk tolerance.
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['stock', '📈 Stocks / ETFs'], ['options', '📊 Options']].map(([id, label]) => (
            <button key={id} className={`btn${mode === id ? ' btn-primary' : ''}`}
              onClick={() => setMode(id)} style={{ fontSize: 11 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {mode === 'stock'   && <StockSizer />}
        {mode === 'options' && <OptionsSizer />}
      </div>

      {/* Rules of thumb */}
      <div className="card" style={{ background: 'var(--bg-tertiary)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          📚 Professional Risk Rules
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          {[
            ['1–2% Rule',        'Risk max 1–2% of account per trade. Pros rarely exceed 2%.'],
            ['Min 2:1 R:R',      'Only take trades with at least 2× reward vs risk. A 50% win rate with 2R pays well.'],
            ['Stop = your plan', 'Set the stop BEFORE entry, not after the trade goes against you.'],
            ['Options = 1–2%',   'For options, use even less (1%) — premium can go to zero.'],
            ['Position limit',   'No single position > 10–15% of account regardless of conviction.'],
            ['Correlated risk',  'If NVDA, AMD, SOXL all move together, you\'re not diversified.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
