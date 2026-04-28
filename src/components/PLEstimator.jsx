import { useState, useMemo } from 'react'

// Black-Scholes helpers (frontend, no backend needed)
function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x >= 0 ? 1 - p : p
}

function bsPrice(S, K, T, r, sigma, type) {
  if (T <= 0 || sigma <= 0) return Math.max(0, type === 'call' ? S - K : K - S)
  const sq = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sq)
  const d2 = d1 - sigma * sq
  if (type === 'call') return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1)
}

export default function PLEstimator({ contract, underlyingPrice, onClose }) {
  const [numContracts, setNumContracts] = useState(1)
  const [movePct,      setMovePct]      = useState(0)

  const { strike, impliedVolatility: iv, daysToExpiry: dte, type, mid, lastPrice } = contract || {}
  const entryPremium = mid || lastPrice || 0
  const T = Math.max(0.0001, (dte || 1) / 365)
  const r = 0.05

  // Price scenarios: entry price to +/- 20% in steps
  const scenarios = useMemo(() => {
    if (!underlyingPrice || !strike || !iv) return []
    const steps = 21
    return Array.from({ length: steps }, (_, i) => {
      const pct     = (i - 10) * 2          // -20% to +20% in 2% steps
      const newS    = underlyingPrice * (1 + pct / 100)
      const optVal  = bsPrice(newS, strike, T, r, iv, type)
      const plPer   = (optVal - entryPremium) * 100  // $ per contract
      const plTotal = plPer * numContracts
      const plPct   = entryPremium > 0 ? (optVal - entryPremium) / entryPremium * 100 : 0
      return { pct, price: +newS.toFixed(2), optVal: +optVal.toFixed(2), plPer: +plPer.toFixed(2), plTotal: +plTotal.toFixed(2), plPct: +plPct.toFixed(1) }
    })
  }, [underlyingPrice, strike, iv, dte, type, entryPremium, numContracts])

  const currentScenario = scenarios.find(s => s.pct === movePct) || scenarios[10]
  const isCall = type === 'call'
  const accent = isCall ? '#22c55e' : '#ef4444'
  const maxLoss = -(entryPremium * 100 * numContracts)
  const breakevenPct = entryPremium && underlyingPrice
    ? (isCall
        ? ((strike + entryPremium) / underlyingPrice - 1) * 100
        : ((strike - entryPremium) / underlyingPrice - 1) * 100)
    : null

  if (!contract) return null

  return (
    <div style={{
      background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)',
      border: `0.5px solid ${accent}44`, padding: '12px 14px', marginTop: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          P&L Estimator —
          <span style={{ color: accent }}> {isCall ? 'CALL' : 'PUT'}</span>
          {' '}${strike} · {dte}d · entry ${entryPremium.toFixed(2)}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>✕</button>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Contracts
          <input type="number" min="1" max="100" value={numContracts}
            onChange={e => setNumContracts(Math.max(1, +e.target.value))}
            style={{ width: 56, fontSize: 11 }} />
        </label>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          Max loss: <strong style={{ color: 'var(--red-text)' }}>${Math.abs(maxLoss).toFixed(0)}</strong>
        </div>
        {breakevenPct != null && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Breakeven: <strong style={{ color: 'var(--amber-text)' }}>
              {breakevenPct > 0 ? '+' : ''}{breakevenPct.toFixed(1)}% (${contract.breakeven})
            </strong>
          </div>
        )}
      </div>

      {/* Slider */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>
          <span>−20%</span>
          <span style={{ fontWeight: 600, color: movePct === 0 ? 'var(--text-secondary)' : movePct > 0 ? '#22c55e' : '#ef4444' }}>
            {movePct > 0 ? '+' : ''}{movePct}% move → ${currentScenario?.price}
          </span>
          <span>+20%</span>
        </div>
        <input type="range" min="-10" max="10" step="1" value={movePct / 2}
          onChange={e => setMovePct(+e.target.value * 2)}
          style={{ width: '100%', accentColor: accent }} />
      </div>

      {/* Current scenario highlight */}
      {currentScenario && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12,
        }}>
          {[
            { label: 'Option value', val: `$${currentScenario.optVal}` },
            { label: 'P&L per contract', val: `${currentScenario.plPer >= 0 ? '+' : ''}$${currentScenario.plPer}`, color: currentScenario.plPer >= 0 ? '#22c55e' : '#ef4444' },
            { label: `Total P&L (${numContracts}x)`, val: `${currentScenario.plTotal >= 0 ? '+' : ''}$${currentScenario.plTotal}`, color: currentScenario.plTotal >= 0 ? '#22c55e' : '#ef4444' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)' }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Scenario table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
              {['Move', 'Stock $', 'Opt val', 'P&L/contract', `Total (${numContracts}x)`, 'P&L%'].map(h => (
                <th key={h} style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text-tertiary)', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenarios.filter((_, i) => i % 2 === 0).map(s => {
              const isBreak = breakevenPct != null && Math.abs(s.pct - breakevenPct) < 1.5
              const isCurrent = s.pct === movePct
              return (
                <tr key={s.pct} onClick={() => setMovePct(s.pct)} style={{
                  borderBottom: '0.5px solid var(--border-subtle)',
                  background: isCurrent ? `${accent}18` : isBreak ? 'var(--amber-dim)' : 'transparent',
                  cursor: 'pointer',
                }}>
                  <td style={{ padding: '3px 6px', textAlign: 'right', color: s.pct > 0 ? '#22c55e' : s.pct < 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 600 }}>
                    {s.pct > 0 ? '+' : ''}{s.pct}%
                  </td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${s.price}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${s.optVal}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: s.plPer >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                    {s.plPer >= 0 ? '+' : ''}${s.plPer}
                  </td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: s.plTotal >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                    {s.plTotal >= 0 ? '+' : ''}${s.plTotal}
                  </td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', color: s.plPct >= 0 ? '#22c55e' : '#ef4444' }}>
                    {s.plPct >= 0 ? '+' : ''}{s.plPct}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 6 }}>
        Estimates based on Black-Scholes · assumes IV constant · click a row to select
      </div>
    </div>
  )
}
