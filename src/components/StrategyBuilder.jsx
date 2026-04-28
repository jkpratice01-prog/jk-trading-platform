import { useState, useEffect, useCallback } from 'react'
import { backendOptions } from '../api/backend.js'

// ── Black-Scholes ─────────────────────────────────────────────────────────────
function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x >= 0 ? 1 - p : p
}

function bsPrice(S, K, T, sigma, r = 0.05, type = 'call') {
  if (T <= 0) return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0)
  if (sigma <= 0 || S <= 0 || K <= 0) return 0
  const sq = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sq)
  const d2 = d1 - sigma * sq
  return type === 'call'
    ? S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    : K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1)
}

function bsGreeks(S, K, T, sigma, r = 0.05, type = 'call') {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0)
    return { delta: type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0 }
  const sq   = Math.sqrt(T)
  const d1   = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sq)
  const d2   = d1 - sigma * sq
  const phi  = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI)
  const delta = type === 'call' ? normCDF(d1) : normCDF(d1) - 1
  const gamma = phi / (S * sigma * sq)
  const vega  = S * phi * sq / 100
  const theta = type === 'call'
    ? (-(S * phi * sigma) / (2 * sq) - r * K * Math.exp(-r * T) * normCDF(d2)) / 365
    : (-(S * phi * sigma) / (2 * sq) + r * K * Math.exp(-r * T) * normCDF(-d2)) / 365
  return {
    delta: +delta.toFixed(4), gamma: +gamma.toFixed(6),
    theta: +theta.toFixed(4), vega:  +vega.toFixed(4),
  }
}

// ── Strategy name detection ────────────────────────────────────────────────────
function detectName(legs) {
  const n = legs.filter(l => l.strike && l.iv).length
  if (n === 0) return 'No complete legs'
  if (n === 1) {
    const l = legs.find(l => l.strike && l.iv)
    return `${l.action === 'buy' ? 'Long' : 'Short'} ${l.type === 'call' ? 'Call' : 'Put'}`
  }
  const active = legs.filter(l => l.strike && l.iv)
  if (n === 2) {
    const [a, b] = [...active].sort((x, y) => x.strike - y.strike)
    if (a.type === b.type && a.action !== b.action) {
      const buyer  = active.find(l => l.action === 'buy')
      const seller = active.find(l => l.action === 'sell')
      if (a.type === 'call') return buyer.strike < seller.strike ? 'Bull Call Spread' : 'Bear Call Spread'
      else                   return buyer.strike > seller.strike ? 'Bear Put Spread'  : 'Bull Put Spread'
    }
    if (a.type !== b.type) {
      const allBuy  = active.every(l => l.action === 'buy')
      const allSell = active.every(l => l.action === 'sell')
      if (a.strike === b.strike) return allBuy ? 'Long Straddle'  : allSell ? 'Short Straddle'  : 'Straddle'
      else                       return allBuy ? 'Long Strangle'  : allSell ? 'Short Strangle'  : 'Strangle'
    }
    if (a.action === b.action) return `${a.action === 'buy' ? 'Long' : 'Short'} ${a.type === 'call' ? 'Call' : 'Put'} Ratio`
  }
  if (n === 4) {
    const calls = active.filter(l => l.type === 'call')
    const puts  = active.filter(l => l.type === 'put')
    if (calls.length === 2 && puts.length === 2) {
      const callBuy = calls.find(l => l.action === 'buy')
      const putBuy  = puts.find(l => l.action === 'buy')
      if (callBuy && putBuy) return 'Iron Condor'
      return 'Iron Butterfly'
    }
  }
  return `${n}-Leg Custom`
}

// ── Payoff at expiry ───────────────────────────────────────────────────────────
function computePayoff(legs, spot) {
  const active = legs.filter(l => l.strike && l.price != null)
  if (!active.length || !spot) return []
  const lo = spot * 0.78, hi = spot * 1.22
  const points = []
  for (let i = 0; i <= 120; i++) {
    const S = lo + (hi - lo) * i / 120
    let pnl = 0
    for (const leg of active) {
      const intr = leg.type === 'call' ? Math.max(S - leg.strike, 0) : Math.max(leg.strike - S, 0)
      const sign = leg.action === 'buy' ? 1 : -1
      pnl += sign * (intr - leg.price) * (leg.qty || 1) * 100
    }
    points.push({ S: +S.toFixed(2), pnl: +pnl.toFixed(2) })
  }
  return points
}

function findBreakevens(payoff) {
  const bes = []
  for (let i = 1; i < payoff.length; i++) {
    if ((payoff[i - 1].pnl < 0) !== (payoff[i].pnl < 0)) {
      const s0 = payoff[i - 1].S, p0 = payoff[i - 1].pnl
      const s1 = payoff[i].S,     p1 = payoff[i].pnl
      bes.push(+(s0 - p0 * (s1 - s0) / (p1 - p0)).toFixed(2))
    }
  }
  return bes
}

// ── Payoff SVG ────────────────────────────────────────────────────────────────
function PayoffChart({ payoff, spot }) {
  if (!payoff.length) return null
  const W = 560, H = 180, PAD = { t: 10, r: 16, b: 28, l: 56 }
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b

  const prices = payoff.map(p => p.S)
  const pnls   = payoff.map(p => p.pnl)
  const xMin = prices[0], xMax = prices[prices.length - 1]
  const yMin = Math.min(...pnls, 0) * 1.1
  const yMax = Math.max(...pnls, 0) * 1.1 || 50

  const xp = S   => PAD.l + (S - xMin) / (xMax - xMin) * cW
  const yp = pnl => PAD.t + cH - (pnl - yMin) / (yMax - yMin) * cH

  // Split into profit (green) and loss (red) segments for fill
  const zeroY = yp(0)
  const pts   = payoff.map(p => `${xp(p.S)},${yp(p.pnl)}`).join(' ')

  // Profit area polygon
  const profitPts = [
    `${xp(xMin)},${zeroY}`,
    ...payoff.filter(p => p.pnl >= 0).map(p => `${xp(p.S)},${yp(p.pnl)}`),
    ...payoff.filter(p => p.pnl < 0).length === payoff.length ? [] : [`${xp(xMax)},${zeroY}`],
  ].join(' ')

  const yTicks = 4
  const yStep  = (yMax - yMin) / yTicks

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', maxWidth: W }}>
      {/* Zero line */}
      <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke="var(--border-default)" strokeWidth={1} />

      {/* Y grid + labels */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const pnl = yMin + i * yStep
        const y   = yp(pnl)
        return (
          <g key={i}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border-subtle)" strokeWidth={0.5} strokeDasharray="3,3" />
            <text x={PAD.l - 4} y={y + 3} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">
              {pnl >= 0 ? '+' : ''}${Math.round(pnl)}
            </text>
          </g>
        )
      })}

      {/* Loss fill */}
      <polygon
        points={`${PAD.l},${zeroY} ${payoff.map(p => `${xp(p.S)},${yp(p.pnl)}`).join(' ')} ${xp(xMax)},${zeroY}`}
        fill="#ef444420"
      />
      {/* Profit fill */}
      <polygon
        points={`${PAD.l},${zeroY} ${payoff.map(p => `${xp(p.S)},${yp(p.pnl)}`).join(' ')} ${xp(xMax)},${zeroY}`}
        fill="#22c55e20"
        clipPath={`polygon(0 0, 100% 0, 100% ${((zeroY - PAD.t) / cH) * 100}%, 0 ${((zeroY - PAD.t) / cH) * 100}%)`}
      />

      {/* P&L line */}
      <polyline points={pts} fill="none" stroke="var(--blue)" strokeWidth={2} />

      {/* Spot price line */}
      {spot && (
        <line x1={xp(spot)} y1={PAD.t} x2={xp(spot)} y2={H - PAD.b}
          stroke="var(--amber)" strokeWidth={1} strokeDasharray="4,3" />
      )}

      {/* X-axis labels */}
      {payoff.filter((_, i) => i % 20 === 0).map(p => (
        <text key={p.S} x={xp(p.S)} y={H - PAD.b + 12} textAnchor="middle" fontSize={8} fill="var(--text-tertiary)">
          ${p.S}
        </text>
      ))}
    </svg>
  )
}

// ── Preset strategies ─────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Bull Call Spread', legs: [{ type:'call', action:'buy', qty:1 }, { type:'call', action:'sell', qty:1 }] },
  { label: 'Bear Put Spread',  legs: [{ type:'put',  action:'buy', qty:1 }, { type:'put',  action:'sell', qty:1 }] },
  { label: 'Long Straddle',    legs: [{ type:'call', action:'buy', qty:1 }, { type:'put',  action:'buy',  qty:1 }] },
  { label: 'Short Strangle',   legs: [{ type:'call', action:'sell',qty:1 }, { type:'put',  action:'sell', qty:1 }] },
  { label: 'Iron Condor',      legs: [
    { type:'put',  action:'buy',  qty:1 }, { type:'put',  action:'sell', qty:1 },
    { type:'call', action:'sell', qty:1 }, { type:'call', action:'buy',  qty:1 },
  ]},
]

const EMPTY_LEG = { type: 'call', action: 'buy', strike: '', expiry: '', iv: '', price: '', qty: 1 }

// ── Main component ─────────────────────────────────────────────────────────────
export default function StrategyBuilder({ initialSymbol = '' }) {
  const [symbol,   setSymbol]   = useState(initialSymbol)
  const [symInput, setSymInput] = useState(initialSymbol)
  const [spot,     setSpot]     = useState(null)
  const [chain,    setChain]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [legs,     setLegs]     = useState([{ ...EMPTY_LEG }, { ...EMPTY_LEG }])
  const [dte,      setDte]      = useState(30)   // days to expiry for Greeks

  // Load chain when symbol set
  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    backendOptions(symbol)
      .then(data => {
        setChain(data)
        setSpot(data?.underlyingPrice || null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol])

  function go() {
    const s = symInput.trim().toUpperCase()
    if (s) setSymbol(s)
  }

  function updateLeg(i, field, value) {
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function applyPreset(preset) {
    setLegs(preset.legs.map(pl => ({ ...EMPTY_LEG, ...pl })))
  }

  function addLeg()    { setLegs(prev => [...prev, { ...EMPTY_LEG }]) }
  function removeLeg(i){ setLegs(prev => prev.filter((_, idx) => idx !== i)) }

  // ── Compute analytics ───────────────────────────────────────────────────────
  const T = dte / 365

  const enriched = legs.map(leg => {
    const strike = parseFloat(leg.strike)
    const iv     = parseFloat(leg.iv) / 100
    const price  = parseFloat(leg.price)
    if (!strike || !iv || !spot) return { ...leg, greeks: null }
    const greeks = bsGreeks(spot, strike, T, iv, 0.05, leg.type)
    return { ...leg, strike, iv, price: isNaN(price) ? bsPrice(spot, strike, T, iv, 0.05, leg.type) : price, greeks }
  })

  const activeLeg = enriched.filter(l => l.strike && l.greeks)

  const netCost = activeLeg.reduce((s, l) => {
    const sign  = l.action === 'buy' ? 1 : -1
    return s + sign * (l.price || 0) * (l.qty || 1) * 100
  }, 0)

  const netDelta = activeLeg.reduce((s, l) => {
    const sign = l.action === 'buy' ? 1 : -1
    return s + sign * (l.greeks?.delta || 0) * (l.qty || 1)
  }, 0)
  const netTheta = activeLeg.reduce((s, l) => {
    const sign = l.action === 'buy' ? 1 : -1
    return s + sign * (l.greeks?.theta || 0) * (l.qty || 1) * 100
  }, 0)
  const netVega = activeLeg.reduce((s, l) => {
    const sign = l.action === 'buy' ? 1 : -1
    return s + sign * (l.greeks?.vega || 0) * (l.qty || 1) * 100
  }, 0)

  const payoff     = computePayoff(enriched, spot)
  const breakevens = findBreakevens(payoff)
  const maxProfit  = payoff.length ? Math.max(...payoff.map(p => p.pnl)) : null
  const maxLoss    = payoff.length ? Math.min(...payoff.map(p => p.pnl)) : null
  const stratName  = detectName(enriched)

  // Strikes for dropdowns
  const callStrikes = (chain?.calls || []).map(c => ({ strike: c.strike, iv: c.impliedVolatility, mid: c.mid }))
  const putStrikes  = (chain?.puts  || []).map(p => ({ strike: p.strike, iv: p.impliedVolatility, mid: p.mid }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Symbol + DTE input */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Options Strategy Builder</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Build spreads · See Greeks + payoff at expiry</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={symInput} onChange={e => setSymInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && go()}
            placeholder="Symbol (e.g. AAPL)" style={{ width: 130 }} />
          <button className="btn btn-primary" onClick={go} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? <span className="spinner" /> : 'Load Chain'}
          </button>
          {spot && (
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {symbol} @ ${spot}
            </span>
          )}
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            DTE for Greeks
            <input type="number" value={dte} min={1} max={365}
              onChange={e => setDte(Number(e.target.value))}
              style={{ width: 55, fontSize: 11 }} />
          </label>
        </div>

        {/* Presets */}
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Quick:</span>
          {PRESETS.map(p => (
            <button key={p.label} className="btn" onClick={() => applyPreset(p)} style={{ fontSize: 10, padding: '2px 8px' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leg builder */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Legs</span>
          <button className="btn" onClick={addLeg} disabled={legs.length >= 4} style={{ fontSize: 10 }}>+ Add leg</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
                {['#','Action','Type','Strike','IV %','Mid $','Qty','Δ','θ/day','Vega',''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 6px', fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enriched.map((leg, i) => {
                const strikes = leg.type === 'call' ? callStrikes : putStrikes
                return (
                  <tr key={i} style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
                    <td style={{ padding: '4px 6px', color: 'var(--text-tertiary)', fontSize: 10 }}>{i + 1}</td>

                    {/* Action */}
                    <td style={{ padding: '4px 4px' }}>
                      <select value={leg.action} onChange={e => updateLeg(i, 'action', e.target.value)}
                        style={{ fontSize: 10, color: leg.action === 'buy' ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 600, padding: '1px 4px' }}>
                        <option value="buy">BUY</option>
                        <option value="sell">SELL</option>
                      </select>
                    </td>

                    {/* Type */}
                    <td style={{ padding: '4px 4px' }}>
                      <select value={leg.type} onChange={e => updateLeg(i, 'type', e.target.value)}
                        style={{ fontSize: 10, padding: '1px 4px' }}>
                        <option value="call">CALL</option>
                        <option value="put">PUT</option>
                      </select>
                    </td>

                    {/* Strike — dropdown if chain loaded, else text input */}
                    <td style={{ padding: '4px 4px' }}>
                      {strikes.length > 0 ? (
                        <select value={leg.strike} style={{ fontSize: 10, padding: '1px 4px', width: 72 }}
                          onChange={e => {
                            const row = strikes.find(s => String(s.strike) === e.target.value)
                            updateLeg(i, 'strike', e.target.value)
                            if (row) {
                              updateLeg(i, 'iv',    String(Math.round((row.iv || 0) * 100)))
                              updateLeg(i, 'price', String((row.mid || 0).toFixed(2)))
                            }
                          }}>
                          <option value="">—</option>
                          {strikes.map(s => (
                            <option key={s.strike} value={s.strike}>${s.strike}</option>
                          ))}
                        </select>
                      ) : (
                        <input type="number" value={leg.strike} placeholder="Strike"
                          onChange={e => updateLeg(i, 'strike', e.target.value)}
                          style={{ width: 65, fontSize: 10, padding: '1px 4px' }} />
                      )}
                    </td>

                    {/* IV */}
                    <td style={{ padding: '4px 4px' }}>
                      <input type="number" value={leg.iv} placeholder="IV"
                        onChange={e => updateLeg(i, 'iv', e.target.value)}
                        style={{ width: 46, fontSize: 10, padding: '1px 4px' }} />
                    </td>

                    {/* Price */}
                    <td style={{ padding: '4px 4px' }}>
                      <input type="number" value={leg.price} placeholder="Mid"
                        onChange={e => updateLeg(i, 'price', e.target.value)}
                        style={{ width: 52, fontSize: 10, padding: '1px 4px' }} />
                    </td>

                    {/* Qty */}
                    <td style={{ padding: '4px 4px' }}>
                      <input type="number" value={leg.qty} min={1} max={100}
                        onChange={e => updateLeg(i, 'qty', Number(e.target.value))}
                        style={{ width: 38, fontSize: 10, padding: '1px 4px' }} />
                    </td>

                    {/* Greeks */}
                    {['delta','theta','vega'].map(g => (
                      <td key={g} style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', fontSize: 10,
                        color: leg.greeks ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                        {leg.greeks ? +(leg.greeks[g] * (leg.action === 'buy' ? 1 : -1) * (g === 'delta' ? 1 : 100)).toFixed(2) : '—'}
                      </td>
                    ))}

                    <td style={{ padding: '4px 4px' }}>
                      <button onClick={() => removeLeg(i)} disabled={legs.length <= 1}
                        style={{ fontSize: 9, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-text)' }}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results */}
      {activeLeg.length > 0 && (
        <>
          {/* Summary metrics */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>{stratName}</span>
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 600,
                background: netCost > 0 ? 'var(--red-dim)' : 'var(--green-dim)',
                color:      netCost > 0 ? 'var(--red-text)' : 'var(--green-text)',
              }}>
                {netCost > 0 ? `Net Debit $${netCost.toFixed(2)}` : `Net Credit $${Math.abs(netCost).toFixed(2)}`}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {[
                { label: 'Max Profit',   val: maxProfit == null ? '∞' : `$${maxProfit.toFixed(0)}`,  color: maxProfit > 0 ? 'var(--green-text)' : 'var(--text-secondary)' },
                { label: 'Max Loss',     val: maxLoss   == null ? '-∞': `$${maxLoss.toFixed(0)}`,    color: maxLoss   < 0 ? 'var(--red-text)'   : 'var(--text-secondary)' },
                { label: 'Breakeven(s)', val: breakevens.length ? breakevens.map(b => `$${b}`).join(' / ') : '—', color: 'var(--amber-text)' },
                { label: 'Net Δ',        val: netDelta.toFixed(3), color: netDelta > 0 ? 'var(--green-text)' : netDelta < 0 ? 'var(--red-text)' : 'var(--text-secondary)' },
                { label: 'θ/day',        val: `$${netTheta.toFixed(2)}`, color: netTheta > 0 ? 'var(--green-text)' : 'var(--red-text)' },
                { label: 'Vega',         val: `$${netVega.toFixed(2)}/1%IV`, color: 'var(--text-secondary)' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '7px 10px' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Payoff diagram */}
          <div className="card">
            <div className="panel-hd" style={{ marginBottom: 8 }}>
              <span className="panel-title">Payoff at Expiry</span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                Dashed line = current price ${spot}
              </span>
            </div>
            <PayoffChart payoff={payoff} spot={spot} />
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              <span style={{ fontSize: 9, color: '#22c55e88' }}>■ Profit zone</span>
              <span style={{ fontSize: 9, color: '#ef444488' }}>■ Loss zone</span>
              {breakevens.map(b => (
                <span key={b} style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                  BE: ${b}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
