import { useState, useEffect } from 'react'
import { backendDeepInfo, backendOptionsFlow, backendIVRank } from '../api/backend.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v, decimals = 1) {
  if (v == null) return '—'
  return (v * 100).toFixed(decimals) + '%'
}
function dollar(v, decimals = 2) {
  if (v == null) return '—'
  return '$' + Number(v).toFixed(decimals)
}
function num(v, decimals = 2) {
  if (v == null) return '—'
  return Number(v).toFixed(decimals)
}
function fmtVol(n) {
  if (n == null) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}

const recColor = {
  strongbuy: 'var(--green-text)', buy: 'var(--green-text)',
  hold: 'var(--amber-text)',
  sell: 'var(--red-text)', strongsell: 'var(--red-text)',
}
const recLabel = {
  strongbuy: 'Strong Buy', buy: 'Buy', hold: 'Hold',
  sell: 'Sell', strongsell: 'Strong Sell',
}

// ── Small reusable building blocks ────────────────────────────────────────────

function Stat({ label, value, color, sub }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)', lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function Panel({ title, icon, loading, children, accent }) {
  return (
    <div className="card" style={{ borderTop: `2px solid ${accent || 'var(--border-subtle)'}`, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span>{icon}</span> {title}
      </div>
      {loading
        ? <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Loading…</div>
        : children}
    </div>
  )
}

function StatGrid({ children }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px' }}>
      {children}
    </div>
  )
}

// ── Panel 1: Options Snapshot ─────────────────────────────────────────────────

function OptionsPanel({ symbol }) {
  const [flow, setFlow]   = useState(null)
  const [ivr,  setIvr]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setFlow(null); setIvr(null)
    Promise.allSettled([
      backendOptionsFlow(symbol),
      backendIVRank(symbol),
    ]).then(([fRes, iRes]) => {
      if (fRes.status === 'fulfilled') setFlow(fRes.value)
      if (iRes.status === 'fulfilled') setIvr(iRes.value)
      setLoading(false)
    })
  }, [symbol])

  const bias = flow?.bias
  const biasColor = bias === 'CALL' ? 'var(--green-text)' : bias === 'PUT' ? 'var(--red-text)' : 'var(--amber-text)'
  const ivrColor  = (ivr?.ivr ?? 50) > 70 ? 'var(--red-text)' : (ivr?.ivr ?? 50) < 30 ? 'var(--green-text)' : 'var(--amber-text)'
  const cpRatio   = flow?.callVolume && flow?.putVolume ? (flow.callVolume / flow.putVolume).toFixed(2) : null
  const cpColor   = cpRatio >= 1.5 ? 'var(--green-text)' : cpRatio <= 0.6 ? 'var(--red-text)' : 'var(--text-primary)'

  return (
    <Panel title="Options Flow" icon="📊" loading={loading} accent="var(--blue)">
      <StatGrid>
        <Stat label="Bias"        value={bias || '—'}           color={biasColor} />
        <Stat label="C/P Ratio"   value={cpRatio ? `${cpRatio}×` : '—'} color={cpColor} />
        <Stat label="Call Vol"    value={fmtVol(flow?.callVolume)} />
        <Stat label="Put Vol"     value={fmtVol(flow?.putVolume)}  />
        <Stat label="Call OI"     value={fmtVol(flow?.callOI)}     />
        <Stat label="Put OI"      value={fmtVol(flow?.putOI)}      />
        <Stat label="Call Premium" value={fmtVol(flow?.callPremium)} sub="notional $" />
        <Stat label="Put Premium"  value={fmtVol(flow?.putPremium)}  sub="notional $" />
        <Stat
          label="IV Rank"
          value={ivr?.ivr != null ? `${ivr.ivr}` : '—'}
          color={ivrColor}
          sub={ivr?.label ? `${ivr.label} · ${ivr.currentIV}% IV` : undefined}
        />
      </StatGrid>
    </Panel>
  )
}

// ── Panel 2: Key Price Levels ─────────────────────────────────────────────────

function PriceLevelsPanel({ symbol, quote, deep, loading }) {
  const price       = quote?.regularMarketPrice
  const w52h        = deep?.week52High
  const w52l        = deep?.week52Low
  const fromHigh    = w52h && price ? (((price - w52h) / w52h) * 100).toFixed(1) : null
  const fromLow     = w52l && price ? (((price - w52l) / w52l) * 100).toFixed(1) : null
  const above50     = deep?.fiftyDayAvg && price ? price > deep.fiftyDayAvg : null
  const above200    = deep?.twoHundredDayAvg && price ? price > deep.twoHundredDayAvg : null

  return (
    <Panel title="Key Price Levels" icon="📏" loading={loading} accent="var(--amber)">
      <StatGrid>
        <Stat label="52-Wk High"   value={dollar(w52h)}        sub={fromHigh ? `${fromHigh}% from here` : undefined} />
        <Stat label="52-Wk Low"    value={dollar(w52l)}        sub={fromLow  ? `+${fromLow}% from low`  : undefined} />
        <Stat label="50-Day MA"    value={dollar(deep?.fiftyDayAvg, 2)}
          color={above50 === true ? 'var(--green-text)' : above50 === false ? 'var(--red-text)' : undefined}
          sub={above50 === true ? 'price above ▲' : above50 === false ? 'price below ▼' : undefined}
        />
        <Stat label="200-Day MA"   value={dollar(deep?.twoHundredDayAvg, 2)}
          color={above200 === true ? 'var(--green-text)' : above200 === false ? 'var(--red-text)' : undefined}
          sub={above200 === true ? 'price above ▲' : above200 === false ? 'price below ▼' : undefined}
        />
        <Stat label="Beta"
          value={deep?.beta != null ? num(deep.beta) : '—'}
          color={deep?.beta > 1.5 ? 'var(--red-text)' : deep?.beta < 0.8 ? 'var(--green-text)' : undefined}
          sub={deep?.beta > 1.5 ? 'high volatility' : deep?.beta < 0.8 ? 'low volatility' : 'moderate'}
        />
      </StatGrid>
    </Panel>
  )
}

// ── Panel 3: Earnings Countdown ───────────────────────────────────────────────

function EarningsPanel({ deep, loading }) {
  const days   = deep?.daysToEarnings
  const daysColor = days <= 2 ? 'var(--red-text)' : days <= 7 ? 'var(--amber-text)' : 'var(--green-text)'

  return (
    <Panel title="Earnings" icon="📅" loading={loading} accent={days <= 7 ? 'var(--red-text)' : 'var(--green-text)'}>
      {!deep?.nextEarningsDate ? (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No upcoming earnings found in the next 30 days</div>
      ) : (
        <StatGrid>
          <Stat label="Earnings Date"    value={deep.nextEarningsDate} />
          <Stat label="Days Away"        value={days != null ? `${days}d` : '—'} color={daysColor} />
          <Stat label="Expected Move ±"
            value={deep.expectedMovePct != null ? `${deep.expectedMovePct}%` : '—'}
            sub={deep.expectedMoveUsd != null ? `≈ $${deep.expectedMoveUsd} per share` : undefined}
            color="var(--amber-text)"
          />
          <Stat label="Options Expiry"   value={deep.earningsExpiry || '—'} sub="used for calc" />
        </StatGrid>
      )}
      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        Expected move = ATM IV × √(DTE/365). Represents the market-implied ±1σ range into earnings.
      </div>
    </Panel>
  )
}

// ── Panel 4: Fundamentals ─────────────────────────────────────────────────────

function FundamentalsPanel({ deep, loading }) {
  const rec      = deep?.recommendationKey?.toLowerCase()
  const recCol   = recColor[rec] || 'var(--text-secondary)'
  const tgtUpside = deep?.targetMeanPrice && deep?.week52High
    ? (((deep.targetMeanPrice - (deep.week52High)) / deep.week52High) * 100).toFixed(1)
    : null

  return (
    <Panel title="Fundamentals" icon="📈" loading={loading} accent="var(--green-text)">
      <StatGrid>
        <Stat label="EPS (TTM)"        value={deep?.trailingEps  != null ? `$${num(deep.trailingEps)}` : '—'} />
        <Stat label="EPS (Fwd)"        value={deep?.forwardEps   != null ? `$${num(deep.forwardEps)}`  : '—'} />
        <Stat label="Forward P/E"      value={deep?.forwardPE    != null ? num(deep.forwardPE)          : '—'} />
        <Stat label="PEG Ratio"
          value={deep?.pegRatio != null ? num(deep.pegRatio) : '—'}
          color={deep?.pegRatio < 1 ? 'var(--green-text)' : deep?.pegRatio > 2 ? 'var(--red-text)' : undefined}
          sub={deep?.pegRatio < 1 ? 'undervalued growth' : deep?.pegRatio > 2 ? 'expensive' : undefined}
        />
        <Stat label="Revenue Growth"
          value={deep?.revenueGrowth != null ? pct(deep.revenueGrowth) : '—'}
          color={deep?.revenueGrowth > 0.1 ? 'var(--green-text)' : deep?.revenueGrowth < 0 ? 'var(--red-text)' : undefined}
        />
        <Stat label="Profit Margin"
          value={deep?.profitMargins != null ? pct(deep.profitMargins) : '—'}
          color={deep?.profitMargins > 0.15 ? 'var(--green-text)' : deep?.profitMargins < 0 ? 'var(--red-text)' : undefined}
        />
        <Stat label="ROE"
          value={deep?.returnOnEquity != null ? pct(deep.returnOnEquity) : '—'}
          color={deep?.returnOnEquity > 0.15 ? 'var(--green-text)' : deep?.returnOnEquity < 0 ? 'var(--red-text)' : undefined}
        />
        <Stat label="Debt / Equity"
          value={deep?.debtToEquity != null ? num(deep.debtToEquity) : '—'}
          color={deep?.debtToEquity > 2 ? 'var(--red-text)' : deep?.debtToEquity < 0.5 ? 'var(--green-text)' : undefined}
        />
        <Stat label="Analyst Target"
          value={dollar(deep?.targetMeanPrice)}
          color={recCol}
          sub={deep?.recommendationKey ? `${recLabel[rec] || rec} · ${deep.numberOfAnalystOpinions || '?'} analysts` : undefined}
        />
      </StatGrid>
    </Panel>
  )
}

// ── Panel 5: Institutions & Short Interest ────────────────────────────────────

function InstitutionsPanel({ deep, loading }) {
  const shortFloat   = deep?.shortFloat         // 0–1
  const instOwned    = deep?.heldPercentInstitutions
  const insiderOwned = deep?.heldPercentInsiders

  const shortColor = shortFloat > 0.15 ? 'var(--red-text)' : shortFloat > 0.07 ? 'var(--amber-text)' : 'var(--green-text)'
  const squeezeScore = shortFloat && deep?.shortRatio
    ? Math.min(100, Math.round(shortFloat * 400 + deep.shortRatio * 5))
    : null
  const squeezeColor = squeezeScore > 70 ? 'var(--red-text)' : squeezeScore > 40 ? 'var(--amber-text)' : 'var(--green-text)'

  return (
    <Panel title="Institutions & Short Interest" icon="🏦" loading={loading} accent="var(--blue)">
      <StatGrid>
        <Stat label="Institutional"
          value={instOwned != null ? pct(instOwned) : '—'}
          sub="% of float owned"
          color={instOwned > 0.7 ? 'var(--green-text)' : undefined}
        />
        <Stat label="Insider"
          value={insiderOwned != null ? pct(insiderOwned) : '—'}
          sub="% of float owned"
          color={insiderOwned > 0.1 ? 'var(--amber-text)' : undefined}
        />
        <Stat label="Short Float"
          value={shortFloat != null ? pct(shortFloat) : '—'}
          color={shortColor}
          sub={shortFloat > 0.15 ? 'high — squeeze risk' : shortFloat > 0.07 ? 'elevated' : 'low'}
        />
        <Stat label="Short Ratio"
          value={deep?.shortRatio != null ? `${num(deep.shortRatio)}d` : '—'}
          sub="days to cover"
          color={deep?.shortRatio > 5 ? 'var(--amber-text)' : undefined}
        />
        <Stat label="Shares Short"  value={fmtVol(deep?.sharesShort)} />
        {squeezeScore != null && (
          <Stat label="Squeeze Score"
            value={`${squeezeScore}/100`}
            color={squeezeColor}
            sub={squeezeScore > 70 ? 'high squeeze potential' : squeezeScore > 40 ? 'moderate' : 'low'}
          />
        )}
      </StatGrid>
    </Panel>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function AnalyzerInsights({ symbol, quote }) {
  const [deep,    setDeep]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setDeep(null)
    backendDeepInfo(symbol)
      .then(d => { setDeep(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [symbol])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
      <OptionsPanel     symbol={symbol} />
      <PriceLevelsPanel symbol={symbol} quote={quote} deep={deep} loading={loading} />
      <EarningsPanel    deep={deep} loading={loading} />
      <FundamentalsPanel deep={deep} loading={loading} />
      <InstitutionsPanel deep={deep} loading={loading} />
    </div>
  )
}
