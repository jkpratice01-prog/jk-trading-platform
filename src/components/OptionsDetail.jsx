// src/components/OptionsDetail.jsx
// Isolated options chain detail panel — rendered outside <tbody> to avoid crashes

import { useState, useEffect, Fragment } from 'react'
import { getOptionsChain, getOptionsChainForExpiry } from '../api/optionsApi.js'
import ContractChart   from './ContractChart.jsx'
import OIWallChart     from './OIWallChart.jsx'
import PLEstimator     from './PLEstimator.jsx'
import VolatilitySkew  from './VolatilitySkew.jsx'
import { backendIVRank, backendOIChanges } from '../api/backend.js'

function fmtK(n) {
  if (n == null || n === 0) return '0'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(Math.round(n))
}

function fmtExpiry(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' })
}

function calcMaxPain(calls, puts, strikes) {
  if (!strikes?.length || !calls?.length || !puts?.length) return null
  let minLoss = Infinity, result = null
  strikes.forEach(strike => {
    const cl = calls.reduce((s, c) => s + Math.max(0, strike - (c.strike || 0)) * (c.openInterest || 0), 0)
    const pl = puts.reduce((s,  p) => s + Math.max(0, (p.strike || 0) - strike) * (p.openInterest || 0), 0)
    const total = cl + pl
    if (total < minLoss) { minLoss = total; result = strike }
  })
  return result
}

export default function OptionsDetail({ sym, price, closes, onClose, refreshKey = 0 }) {
  const [chain,         setChain]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [expIdx,        setExpIdx]        = useState(0)
  const [tab,           setTab]           = useState('summary')
  const [loadingExp,    setLoadingExp]    = useState(false)
  const [chartContract, setChartContract] = useState(null)
  const [plContract,    setPlContract]    = useState(null)
  const [ivRank,        setIvRank]        = useState(null)
  const [oiChanges,     setOiChanges]     = useState(null)
  const [show0DTE,      setShow0DTE]      = useState(false)

  useEffect(() => {
    let cancelled = false
    // On auto-refresh (refreshKey > 0 and sym hasn't changed): silently update without full reset
    const silent = refreshKey > 0
    if (!silent) {
      setLoading(true); setError(null); setChain(null); setExpIdx(0); setTab('summary')
      setIvRank(null); setOiChanges(null); setPlContract(null); setChartContract(null)
    }
    getOptionsChain(sym, price, closes || [])
      .then(data => {
        if (!cancelled) {
          setChain(data)
          if (!silent) setLoading(false)
        }
      })
      .catch(err => { if (!cancelled && !silent) { setError(err.message); setLoading(false) } })
    // Refresh IVR and OI changes in parallel
    backendIVRank(sym).then(d => { if (!cancelled) setIvRank(d) }).catch(() => {})
    backendOIChanges(sym).then(d => { if (!cancelled) setOiChanges(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [sym, refreshKey])

  async function switchExpiry(idx) {
    if (!chain) return
    setExpIdx(idx)
    const expiry = chain.expirationLabels?.[idx]
    if (!expiry) return
    setLoadingExp(true)
    try {
      const updated = await getOptionsChainForExpiry(sym, expiry)
      if (updated?.calls?.length) {
        setChain(prev => ({
          ...prev,
          calls:           updated.calls,
          puts:            updated.puts,
          strikes:         updated.strikes         ?? prev.strikes,
          selectedExpiry:  updated.selectedExpiry  ?? expiry,
        }))
      }
    } catch(e) { console.warn('Expiry switch failed', e) }
    setLoadingExp(false)
  }

  const hasAlpaca  = !!(import.meta.env.VITE_ALPACA_KEY_ID && import.meta.env.VITE_ALPACA_SECRET_KEY)
  const hasAvKey   = !!import.meta.env.VITE_ALPHA_VANTAGE_API_KEY
  const hasTradier = !!import.meta.env.VITE_TRADIER_TOKEN
  const hasAnySource = hasAlpaca || hasAvKey || hasTradier

  // ── No API keys configured ─────────────────────────────────────────────────
  if (!hasAnySource) return (
    <div style={{
      padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--r-lg)',
      border: '0.5px solid var(--border-subtle)', margin: '4px 0',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            Real options data requires an API key — choose one:
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.9 }}>
            <strong>Option A — Alpaca (free, recommended):</strong><br/>
            Sign up free at <strong>alpaca.markets</strong> → Paper Trading → API Keys<br/>
            <code style={{ background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 3 }}>VITE_ALPACA_KEY_ID=your_key</code><br/>
            <code style={{ background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 3 }}>VITE_ALPACA_SECRET_KEY=your_secret</code><br/><br/>
            <strong>Option B — Tradier (free account):</strong><br/>
            Sign up at <strong>tradier.com/products/markets/data-api</strong><br/>
            <code style={{ background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 3 }}>VITE_TRADIER_TOKEN=your_token</code>
          </div>
        </div>
        <button onClick={onClose} style={{ fontSize: 11, cursor: 'pointer', color: 'var(--text-tertiary)', background: 'none', border: 'none', flexShrink: 0 }}>✕</button>
      </div>
    </div>
  )

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{
      padding: '20px', textAlign: 'center',
      background: 'var(--bg-secondary)', borderRadius: 'var(--r-lg)',
      border: '0.5px solid var(--border-subtle)', margin: '4px 0',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
        <span style={{ display: 'inline-block', width: 12, height: 12, border: '1.5px solid var(--border-default)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin .6s linear infinite', verticalAlign: 'middle', marginRight: 6 }} />
        Fetching options chain for <strong>{sym}</strong>...
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Connecting to Tradier...</div>
    </div>
  )

  if (error || !chain) return (
    <div style={{
      padding: '12px 16px', background: 'var(--bg-secondary)',
      borderRadius: 'var(--r-lg)', border: '0.5px solid var(--border-subtle)', margin: '4px 0',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {error
          ? `Error loading chain for ${sym}: ${error}`
          : `No options data for ${sym}. ${hasAvKey ? 'AlphaVantage options requires a premium plan.' : 'Add VITE_TRADIER_TOKEN to .env for real data.'}`
        }
      </span>
      <button onClick={onClose} style={{ fontSize: 11, cursor: 'pointer', color: 'var(--text-tertiary)', background: 'none', border: 'none' }}>✕</button>
    </div>
  )

  // ── Data prep ──────────────────────────────────────────────────────────────
  const calls  = chain.calls  || []
  const puts   = chain.puts   || []
  const strikes = chain.strikes || []
  const expLabels  = chain.expirationLabels || (chain.expirationDates || []).map(fmtExpiry)

  // Use backend-provided underlying price as authoritative source; prop is fallback.
  // This prevents the ATM sort from breaking when price prop is null (e.g. after hours).
  const underlyingPrice = chain.underlyingPrice || price || null

  const totalCallOI  = calls.reduce((s, c) => s + (c.openInterest || 0), 0)
  const totalPutOI   = puts.reduce((s,  p) => s + (p.openInterest  || 0), 0)
  const totalCallVol = calls.reduce((s, c) => s + (c.volume        || 0), 0)
  const totalPutVol  = puts.reduce((s,  p) => s + (p.volume        || 0), 0)
  const pcVol = totalCallVol > 0 ? (totalPutVol / totalCallVol).toFixed(2) : '—'
  const pcOI  = totalCallOI  > 0 ? (totalPutOI  / totalCallOI).toFixed(2)  : '—'
  const maxPain = calcMaxPain(calls, puts, strikes)
  const bull  = parseFloat(pcVol) < 0.9

  // After-hours: yfinance returns OI=0 and bid/ask=0 for all contracts.
  // Detect this and show an informational note instead of treating as missing data.
  const isAfterHours = calls.length > 0 && totalCallOI === 0 && totalCallVol > 0
  const hasOI = totalCallOI > 0 || totalPutOI > 0

  function sortByATM(contracts) {
    const ref = underlyingPrice  // use the chain's own underlying price, never null
    return [...contracts].sort((a, b) => {
      const distA = ref ? Math.abs((a.strike || 0) - ref) : 0
      const distB = ref ? Math.abs((b.strike || 0) - ref) : 0
      if (distA !== distB) return distA - distB          // ATM first
      const oiA = (a.openInterest || 0), oiB = (b.openInterest || 0)
      if (oiA !== oiB) return oiB - oiA                  // higher OI within same distance
      return (b.volume || 0) - (a.volume || 0)           // then by volume
    })
  }

  // 0DTE filter: only include contracts expiring today (within next 24h)
  const todayMs  = Date.now()
  const filter0DTE = (contracts) => show0DTE
    ? contracts.filter(c => c.expiration && (c.expiration * 1000 - todayMs) < 86400000)
    : contracts

  const topCalls = sortByATM(filter0DTE(calls)).slice(0, 20)
  const topPuts  = sortByATM(filter0DTE(puts)).slice(0, 20)
  const unusual  = [
    ...calls.map(c=>({...c,type:'CALL'})),
    ...puts.map(p=>({...p,type:'PUT'})),
  ].filter(o => {
    const vol = o.volume || 0, oi = o.openInterest || 0
    // For zero-OI stocks, flag high-volume contracts instead
    if (!hasOI) return vol > 100
    return vol > 0 && oi > 0 && (vol / oi) > 1.5 && vol > 50
  })
   .sort((a,b) => {
     if (!hasOI) return (b.volume||0) - (a.volume||0)
     return (b.volume/b.openInterest)-(a.volume/a.openInterest)
   })
   .slice(0,12)

  const srcBadge =
    chain.source === 'alpaca'
      ? { bg: 'var(--green-dim)',  color: 'var(--green-text)',  label: `✓ ${chain.sourceLabel}`           }
    : chain.source === 'alphavantage'
      ? { bg: 'var(--green-dim)',  color: 'var(--green-text)',  label: '✓ AlphaVantage — real-time'       }
    : chain.source === 'tradier'
      ? { bg: 'var(--green-dim)',  color: 'var(--green-text)',  label: '✓ Tradier — real data'            }
    : chain.source === 'yfinance'
      ? { bg: 'var(--green-dim)',  color: 'var(--green-text)',  label: '✓ Yahoo Finance — real data'      }
      : { bg: 'var(--amber-dim)',  color: 'var(--amber-text)',  label: `⚠ ${chain.source || 'Unknown'}`  }

  const thStyle = { fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'left', padding: '4px 6px', borderBottom: '0.5px solid var(--border-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }
  const tdStyle = { fontSize: 11, padding: '4px 6px', borderBottom: '0.5px solid var(--border-subtle)', whiteSpace: 'nowrap' }

  return (
    <div style={{
      background: 'var(--bg-secondary)', borderRadius: 'var(--r-lg)',
      border: '0.5px solid var(--border-default)', padding: '12px 14px', margin: '4px 0',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13 }}>{sym} — Options chain</strong>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: srcBadge.bg, color: srcBadge.color }}>
            {srcBadge.label}
          </span>
          {/* IV Rank badge */}
          {ivRank?.ivr != null && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
              background: ivRank.ivr > 70 ? 'var(--red-dim)' : ivRank.ivr < 30 ? 'var(--green-dim)' : 'var(--amber-dim)',
              color: ivRank.ivr > 70 ? 'var(--red-text)' : ivRank.ivr < 30 ? 'var(--green-text)' : 'var(--amber-text)',
            }}>
              IVR {ivRank.ivr}% ({ivRank.label}) · IV {ivRank.currentIV}%
            </span>
          )}
          {/* Expected move from ATM IV */}
          {(() => {
            const atm = [...calls, ...puts].find(c => Math.abs((c.strike - price) / (price || 1)) < 0.03)
            if (!atm?.expectedMove) return null
            return (
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                ±${atm.expectedMove} expected move
              </span>
            )
          })()}
        </div>
        <button onClick={onClose} style={{ fontSize: 11, padding: '3px 10px', border: '0.5px solid var(--border-default)', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
          ✕ Close
        </button>
      </div>

      {/* Expiry pills + 0DTE filter */}
      {expLabels.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginRight: 4 }}>Expiry:</span>
          {expLabels.slice(0, 8).map((label, i) => {
            const is0DTE = (chain.expirationDates?.[i] || 0) * 1000 < Date.now() + 86400000 &&
                           (chain.expirationDates?.[i] || 0) * 1000 > Date.now() - 86400000
            return (
              <button key={i} onClick={() => switchExpiry(i)} style={{
                fontSize: 10, padding: '2px 8px', border: '0.5px solid var(--border-subtle)',
                borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
                background: expIdx === i ? 'var(--bg-tertiary)' : 'transparent',
                color: expIdx === i ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderColor: expIdx === i ? 'var(--border-default)' : 'var(--border-subtle)',
              }}>
                {loadingExp && expIdx === i ? '...' : label}
                {is0DTE && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--amber-text)' }}>0DTE</span>}
              </button>
            )
          })}
          {expLabels.length > 8 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>+{expLabels.length - 8} more</span>}
          {/* 0DTE filter toggle */}
          <label style={{ marginLeft: 8, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: show0DTE ? 'var(--amber-text)' : 'var(--text-tertiary)' }}>
            <input type="checkbox" checked={show0DTE} onChange={e => setShow0DTE(e.target.checked)} style={{ cursor: 'pointer' }} />
            0DTE only
          </label>
        </div>
      )}

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 6, marginBottom: 10 }}>
        {[
          { label: 'P/C volume', val: pcVol,  color: parseFloat(pcVol)<0.8?'var(--green-text)':parseFloat(pcVol)>1.1?'var(--red-text)':'var(--amber-text)' },
          { label: 'P/C OI',    val: pcOI,   color: parseFloat(pcOI)<0.8?'var(--green-text)':parseFloat(pcOI)>1.1?'var(--red-text)':'var(--amber-text)' },
          { label: 'Call OI',   val: fmtK(totalCallOI), color: 'var(--green-text)' },
          { label: 'Put OI',    val: fmtK(totalPutOI),  color: 'var(--red-text)'  },
          { label: 'Max pain',  val: maxPain ? `$${maxPain}` : '—', color: 'var(--amber-text)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '7px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* After-hours notice */}
      {isAfterHours && (
        <div style={{ marginBottom: 10, padding: '6px 10px', background: 'var(--amber-dim)', borderRadius: 'var(--r-md)', fontSize: 10, color: 'var(--amber-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          🌙 <strong>After hours</strong> — Bid/ask and OI are 0 (market closed). Volume shows today's real activity. OI reloads next morning.
        </div>
      )}

      {/* Call/put volume bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
          <span style={{ color: 'var(--green-text)' }}>Calls {fmtK(totalCallVol)} vol</span>
          <span style={{ fontWeight: 600, color: bull ? 'var(--green-text)' : 'var(--red-text)' }}>
            {bull ? '↑ Net bullish flow' : '↓ Net bearish flow'}
          </span>
          <span style={{ color: 'var(--red-text)' }}>Puts {fmtK(totalPutVol)} vol</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden', display: 'flex' }}>
          {totalCallVol + totalPutVol > 0 && (
            <>
              <div style={{ width: `${(totalCallVol / (totalCallVol + totalPutVol)) * 100}%`, background: 'var(--green)' }} />
              <div style={{ flex: 1, background: 'var(--red)' }} />
            </>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { id: 'summary',    label: 'Summary' },
          { id: 'calls',      label: `Calls (${topCalls.length})` },
          { id: 'puts',       label: `Puts (${topPuts.length})` },
          { id: 'oi-wall',    label: 'OI Wall' },
          { id: 'oi-changes', label: `OI Changes${oiChanges?.totalChanged ? ` (${oiChanges.totalChanged})` : ''}` },
          { id: 'unusual',    label: `Unusual (${unusual.length})` },
          { id: 'skew',       label: 'Vol Skew' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontSize: 10, padding: '3px 10px', border: '0.5px solid var(--border-subtle)',
            borderRadius: 20, cursor: 'pointer',
            background: tab === t.id ? 'var(--bg-tertiary)' : 'transparent',
            color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderColor: tab === t.id ? 'var(--border-default)' : 'var(--border-subtle)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Summary */}
      {tab === 'summary' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', fontSize: 11, lineHeight: 2 }}>
            {[
              ['Current price',   price ? `$${price.toFixed(2)}` : '—',      'var(--text-primary)'],
              ['Max pain level',  maxPain ? `$${maxPain}` : '—',             'var(--amber-text)'],
              ['P/C vol ratio',   pcVol,                                       parseFloat(pcVol)<1?'var(--green-text)':'var(--red-text)'],
              ['P/C OI ratio',    pcOI,                                        parseFloat(pcOI)<1?'var(--green-text)':'var(--red-text)'],
              ['Total call OI',   fmtK(totalCallOI),                           'var(--green-text)'],
              ['Total put OI',    fmtK(totalPutOI),                            'var(--red-text)'],
              ['Top call strike', topCalls[0] ? `$${topCalls[0].strike} (${fmtK(topCalls[0].openInterest)} OI)` : '—', 'var(--text-primary)'],
              ['Top put strike',  topPuts[0]  ? `$${topPuts[0].strike} (${fmtK(topPuts[0].openInterest)} OI)` : '—',  'var(--text-primary)'],
              ['Unusual activity',`${unusual.length} contracts`,               unusual.length>3?'var(--amber-text)':'var(--text-secondary)'],
              ['Data source',     srcBadge.label,                              srcBadge.color],
            ].map(([label, val, color]) => (
              <div key={label} style={{ borderBottom: '0.5px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                <strong style={{ color }}>{val}</strong>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 8, fontSize: 11, fontWeight: 500, color: bull ? 'var(--green-text)' : 'var(--red-text)' }}>
            {bull
              ? `📈 Net BULLISH — more call volume than puts (P/C ${pcVol}). Traders are buying upside.${maxPain ? ` Max pain $${maxPain} — market makers may pin near this level.` : ''}`
              : `📉 Net BEARISH — more put volume than calls (P/C ${pcVol}). Traders are hedging or shorting.${maxPain ? ` Max pain $${maxPain} — market makers may pin near this level.` : ''}`
            }
          </div>
        </div>
      )}

      {/* Calls table */}
      {tab === 'calls' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Strike','Last','Bid/Ask','B/E','θ/day','Volume','OI','Vol/OI ⚡','IV','Δ','ITM?','📈','P&L'].map(h=><th key={h} style={thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>
              {topCalls.map((c, i) => {
                const ratio     = c.openInterest > 0 ? (c.volume / c.openInterest).toFixed(2) : '—'
                const itm       = underlyingPrice && c.strike < underlyingPrice
                const dte       = c.expiration ? Math.max(0, Math.round((c.expiration * 1000 - Date.now()) / 86400000)) : null
                const isCharted = chartContract?.contractSymbol === c.contractSymbol
                const isPL      = plContract?.contractSymbol === c.contractSymbol
                return (
                  <Fragment key={c.contractSymbol || i}>
                    <tr style={{ background: isCharted || isPL ? 'var(--bg-hover)' : i%2===0 ? 'var(--bg-primary)' : 'transparent' }}>
                      <td style={{...tdStyle, fontWeight:700, color:'var(--green-text)', fontFamily:'var(--font-mono)'}}>
                        ${c.strike}
                        {dte != null && <span style={{ marginLeft:3, fontSize:8, padding:'1px 4px', borderRadius:6, background: dte<=7?'var(--red-dim)':dte<=21?'var(--amber-dim)':'var(--bg-tertiary)', color: dte<=7?'var(--red-text)':dte<=21?'var(--amber-text)':'var(--text-tertiary)'}}>{dte}d</span>}
                      </td>
                      <td style={{...tdStyle, fontFamily:'var(--font-mono)'}}>${(c.lastPrice||0).toFixed(2)}</td>
                      <td style={{...tdStyle, color:'var(--text-secondary)', fontFamily:'var(--font-mono)', fontSize:9}}>${(c.bid||0).toFixed(2)}/${(c.ask||0).toFixed(2)}</td>
                      <td style={{...tdStyle, fontFamily:'var(--font-mono)', color:'var(--amber-text)', fontWeight:600}}>{c.breakeven ? `$${c.breakeven}` : '—'}</td>
                      <td style={{...tdStyle, fontFamily:'var(--font-mono)', color:'var(--red-text)', fontSize:9}}>{c.thetaPerDay ? `$${c.thetaPerDay}` : '—'}</td>
                      <td style={{...tdStyle, color:(c.volume||0)>500?'var(--green-text)':'var(--text-primary)'}}>{fmtK(c.volume)}</td>
                      <td style={tdStyle}>{fmtK(c.openInterest)}</td>
                      <td style={{...tdStyle, color:parseFloat(ratio)>1.5?'var(--amber-text)':'var(--text-secondary)', fontWeight:parseFloat(ratio)>1.5?700:400}}>
                        {ratio}{parseFloat(ratio)>1.5?' ⚡':''}
                      </td>
                      <td style={{...tdStyle, color:'var(--text-secondary)'}}>{c.impliedVolatility?(c.impliedVolatility*100).toFixed(0)+'%':'—'}</td>
                      <td style={{...tdStyle, fontFamily:'var(--font-mono)', color:(c.delta||0)>0.5?'var(--green-text)':'var(--text-secondary)'}}>{c.delta?.toFixed(2) ?? '—'}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, fontWeight:500, background:itm?'var(--green-dim)':'var(--bg-tertiary)', color:itm?'var(--green-text)':'var(--text-secondary)' }}>
                          {itm?'ITM':'OTM'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <button className={`btn ${isCharted?'btn-primary':''}`} style={{ fontSize:9, padding:'2px 5px' }}
                          onClick={() => setChartContract(isCharted ? null : { ...c, type:'call' })}>📈</button>
                      </td>
                      <td style={tdStyle}>
                        <button className={`btn ${isPL?'btn-primary':''}`} style={{ fontSize:9, padding:'2px 5px' }}
                          onClick={() => setPlContract(isPL ? null : { ...c, type:'call' })}>$</button>
                      </td>
                    </tr>
                    {/* Chart expands inline directly below this row */}
                    {isCharted && (
                      <tr>
                        <td colSpan={13} style={{ padding: 0, background: 'var(--bg-secondary)' }}>
                          <ContractChart symbol={sym} contract={chartContract} onClose={() => setChartContract(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Puts table */}
      {tab === 'puts' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Strike','Last','Bid/Ask','B/E','θ/day','Volume','OI','Vol/OI ⚡','IV','Δ','ITM?','📈','P&L'].map(h=><th key={h} style={thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>
              {topPuts.map((p, i) => {
                const ratio     = p.openInterest > 0 ? (p.volume / p.openInterest).toFixed(2) : '—'
                const itm       = underlyingPrice && p.strike > underlyingPrice
                const dte       = p.expiration ? Math.max(0, Math.round((p.expiration * 1000 - Date.now()) / 86400000)) : null
                const isCharted = chartContract?.contractSymbol === p.contractSymbol
                const isPL      = plContract?.contractSymbol === p.contractSymbol
                return (
                  <Fragment key={p.contractSymbol || i}>
                    <tr style={{ background: isCharted || isPL ? 'var(--bg-hover)' : i%2===0 ? 'var(--bg-primary)' : 'transparent' }}>
                      <td style={{...tdStyle, fontWeight:700, color:'var(--red-text)', fontFamily:'var(--font-mono)'}}>
                        ${p.strike}
                        {dte != null && <span style={{ marginLeft:3, fontSize:8, padding:'1px 4px', borderRadius:6, background: dte<=7?'var(--red-dim)':dte<=21?'var(--amber-dim)':'var(--bg-tertiary)', color: dte<=7?'var(--red-text)':dte<=21?'var(--amber-text)':'var(--text-tertiary)'}}>{dte}d</span>}
                      </td>
                      <td style={{...tdStyle, fontFamily:'var(--font-mono)'}}>${(p.lastPrice||0).toFixed(2)}</td>
                      <td style={{...tdStyle, color:'var(--text-secondary)', fontFamily:'var(--font-mono)', fontSize:9}}>${(p.bid||0).toFixed(2)}/${(p.ask||0).toFixed(2)}</td>
                      <td style={{...tdStyle, fontFamily:'var(--font-mono)', color:'var(--amber-text)', fontWeight:600}}>{p.breakeven ? `$${p.breakeven}` : '—'}</td>
                      <td style={{...tdStyle, fontFamily:'var(--font-mono)', color:'var(--red-text)', fontSize:9}}>{p.thetaPerDay ? `$${p.thetaPerDay}` : '—'}</td>
                      <td style={{...tdStyle, color:(p.volume||0)>500?'var(--red-text)':'var(--text-primary)'}}>{fmtK(p.volume)}</td>
                      <td style={tdStyle}>{fmtK(p.openInterest)}</td>
                      <td style={{...tdStyle, color:parseFloat(ratio)>1.5?'var(--amber-text)':'var(--text-secondary)', fontWeight:parseFloat(ratio)>1.5?700:400}}>
                        {ratio}{parseFloat(ratio)>1.5?' ⚡':''}
                      </td>
                      <td style={{...tdStyle, color:'var(--text-secondary)'}}>{p.impliedVolatility?(p.impliedVolatility*100).toFixed(0)+'%':'—'}</td>
                      <td style={{...tdStyle, fontFamily:'var(--font-mono)', color:(p.delta||0)<-0.5?'var(--red-text)':'var(--text-secondary)'}}>{p.delta?.toFixed(2) ?? '—'}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, fontWeight:500, background:itm?'var(--red-dim)':'var(--bg-tertiary)', color:itm?'var(--red-text)':'var(--text-secondary)' }}>
                          {itm?'ITM':'OTM'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <button className={`btn ${isCharted?'btn-primary':''}`} style={{ fontSize:9, padding:'2px 5px' }}
                          onClick={() => setChartContract(isCharted ? null : { ...p, type:'put' })}>📈</button>
                      </td>
                      <td style={tdStyle}>
                        <button className={`btn ${isPL?'btn-primary':''}`} style={{ fontSize:9, padding:'2px 5px' }}
                          onClick={() => setPlContract(isPL ? null : { ...p, type:'put' })}>$</button>
                      </td>
                    </tr>
                    {/* Chart expands inline directly below this row */}
                    {isCharted && (
                      <tr>
                        <td colSpan={13} style={{ padding: 0, background: 'var(--bg-secondary)' }}>
                          <ContractChart symbol={sym} contract={chartContract} onClose={() => setChartContract(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Unusual activity */}
      {tab === 'unusual' && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            ⚡ Unusual = volume &gt; 1.5× open interest — fresh positioning opened today, not existing holders rolling.
          </div>
          {unusual.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 11, padding: '12px 0' }}>
              No unusual activity detected. Try a different expiry date above.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Type','Strike','Expiry','Volume','Open int.','Vol/OI','Last','IV','Signal'].map(h=><th key={h} style={thStyle}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {unusual.map((o, i) => {
                    const ratio  = (o.volume / o.openInterest).toFixed(1)
                    const isCall = o.type === 'CALL'
                    const itm    = underlyingPrice && (isCall ? o.strike < underlyingPrice : o.strike > underlyingPrice)
                    const expLabel = o.expirationLabel || (o.expiration ? fmtExpiry(o.expiration) : '—')
                    return (
                      <tr key={i} style={{ background: i%2===0?'var(--bg-primary)':'transparent' }}>
                        <td style={tdStyle}>
                          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, fontWeight:600, background:isCall?'var(--green-dim)':'var(--red-dim)', color:isCall?'var(--green-text)':'var(--red-text)' }}>
                            {o.type}
                          </span>
                        </td>
                        <td style={{...tdStyle, fontWeight:700, fontFamily:'var(--font-mono)', color:isCall?'var(--green-text)':'var(--red-text)'}}>{'$'+o.strike}</td>
                        <td style={{...tdStyle, color:'var(--text-secondary)', fontSize:10}}>{expLabel}</td>
                        <td style={{...tdStyle, color:isCall?'var(--green-text)':'var(--red-text)', fontWeight:600}}>{fmtK(o.volume)}</td>
                        <td style={{...tdStyle, color:'var(--text-secondary)'}}>{fmtK(o.openInterest)}</td>
                        <td style={{...tdStyle, color:'var(--amber-text)', fontWeight:700}}>{ratio}× ⚡</td>
                        <td style={{...tdStyle, fontFamily:'var(--font-mono)'}}>${(o.lastPrice||0).toFixed(2)}</td>
                        <td style={{...tdStyle, color:'var(--text-secondary)'}}>{o.impliedVolatility?(o.impliedVolatility*100).toFixed(0)+'%':'—'}</td>
                        <td style={tdStyle}>
                          <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, fontWeight:500, background:itm?(isCall?'var(--green-dim)':'var(--red-dim)'):'var(--bg-tertiary)', color:itm?(isCall?'var(--green-text)':'var(--red-text)'):'var(--text-secondary)' }}>
                            {itm?'ITM':'OTM'} · {isCall?'Bull':'Bear'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* OI Wall tab */}
      {tab === 'oi-wall' && (
        <OIWallChart
          symbol={sym}
          expiry={chain.expirationLabels?.[expIdx]}
          underlyingPrice={price}
          maxPain={chain.summary?.maxPain}
        />
      )}

      {/* OI Changes tab */}
      {tab === 'oi-changes' && (
        <div>
          {!oiChanges || oiChanges.changes?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-tertiary)', fontSize: 11 }}>
              {oiChanges?.message || 'Need 2+ snapshots — open the chain again after a few minutes to see OI changes.'}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                OI change from {oiChanges.prevTime} → {oiChanges.currTime} · {oiChanges.totalChanged} contracts changed
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Type','Strike','Prev OI','Curr OI','Δ OI','Chg%','Signal'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {oiChanges.changes.slice(0, 20).map((c, i) => {
                    const isCall = c.type === 'call'
                    const opening = c.signal === 'opening'
                    return (
                      <tr key={i} style={{ background: i%2===0?'var(--bg-primary)':'transparent' }}>
                        <td style={tdStyle}>
                          <span style={{ fontSize:9, padding:'2px 6px', borderRadius:10, fontWeight:600,
                            background: isCall?'var(--green-dim)':'var(--red-dim)',
                            color: isCall?'var(--green-text)':'var(--red-text)' }}>
                            {c.type.toUpperCase()}
                          </span>
                        </td>
                        <td style={{...tdStyle, fontWeight:700, fontFamily:'var(--font-mono)', color: isCall?'var(--green-text)':'var(--red-text)'}}>${c.strike}</td>
                        <td style={{...tdStyle, color:'var(--text-secondary)', fontFamily:'var(--font-mono)'}}>{fmtK(c.prevOI)}</td>
                        <td style={{...tdStyle, fontFamily:'var(--font-mono)'}}>{fmtK(c.currOI)}</td>
                        <td style={{...tdStyle, fontFamily:'var(--font-mono)', fontWeight:700, color: c.deltaOI > 0 ? 'var(--green-text)' : 'var(--red-text)'}}>
                          {c.deltaOI > 0 ? '+' : ''}{fmtK(c.deltaOI)}
                        </td>
                        <td style={{...tdStyle, color: c.pctChange > 0 ? 'var(--green-text)' : 'var(--red-text)'}}>
                          {c.pctChange > 0 ? '+' : ''}{c.pctChange}%
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize:9, padding:'2px 6px', borderRadius:10, fontWeight:600,
                            background: opening ? 'var(--green-dim)' : 'var(--red-dim)',
                            color: opening ? 'var(--green-text)' : 'var(--red-text)' }}>
                            {opening ? '▲ Opening' : '▼ Closing'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Volatility skew tab */}
      {tab === 'skew' && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            IV by strike — call IV (green) vs put IV (red). Skew shows if market prices downside or upside risk higher.
          </div>
          <VolatilitySkew
            symbol={sym}
            expiry={chain.expirationLabels?.[expIdx] || chain.selectedExpiry}
          />
        </div>
      )}

      {/* P&L Estimator panel (shown below any contract table) */}
      {plContract && (
        <PLEstimator
          contract={plContract}
          underlyingPrice={price}
          onClose={() => setPlContract(null)}
        />
      )}
    </div>
  )
}
