import { useState, useEffect } from 'react'
import { backendFlowScan } from '../api/backend.js'

function fmtPremium(n) {
  if (n == null) return '—'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n
}

// Per-contract conviction based on type + ITM/OTM + delta magnitude
function contractBias(r) {
  const d   = Math.abs(r.delta ?? 0)
  const itm = r.itm
  if (r.type === 'call') {
    if (itm || d >= 0.6)  return { label: 'Strong Bull', color: 'var(--green-text)', bg: 'var(--green-dim)' }
    if (d >= 0.35)         return { label: 'Bull',        color: 'var(--green-text)', bg: 'var(--green-dim)' }
    return                        { label: 'Spec Bull',   color: '#86efac',           bg: 'var(--green-dim)' }
  } else {
    if (itm || d >= 0.6)  return { label: 'Strong Bear', color: 'var(--red-text)',   bg: 'var(--red-dim)'   }
    if (d >= 0.35)         return { label: 'Bear',        color: 'var(--red-text)',   bg: 'var(--red-dim)'   }
    return                        { label: 'Spec Bear',   color: '#fca5a5',           bg: 'var(--red-dim)'   }
  }
}

// Mini call/put bar for symbol summary cards
function BiasBar({ callPct, height = 4 }) {
  return (
    <div style={{ height, borderRadius: 2, overflow: 'hidden', display: 'flex' }}>
      <div style={{ width: `${callPct}%`, background: 'var(--green)', transition: 'width .3s' }} />
      <div style={{ flex: 1, background: 'var(--red)' }} />
    </div>
  )
}

// Per-symbol summary card shown above the table
function SymbolBiasCard({ sym, info, active, onClick }) {
  const { bias, callPct, callPremium, putPremium } = info
  const color = bias === 'BULLISH' ? 'var(--green-text)' : bias === 'BEARISH' ? 'var(--red-text)' : 'var(--amber-text)'
  return (
    <div
      onClick={onClick}
      style={{
        padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
        background: active ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        border: `0.5px solid ${active ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        minWidth: 100,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{sym}</span>
        <span style={{ fontSize: 9, fontWeight: 600, color }}>{bias}</span>
      </div>
      <BiasBar callPct={callPct} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: 'var(--text-tertiary)' }}>
        <span style={{ color: 'var(--green-text)' }}>C {fmtPremium(callPremium)}</span>
        <span style={{ color: 'var(--red-text)' }}>P {fmtPremium(putPremium)}</span>
      </div>
    </div>
  )
}

export default function FlowScannerTab({ onAnalyze }) {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')     // 'all' | 'call' | 'put'
  const [symFilter,  setSymFilter]  = useState(null)      // null = all symbols
  const [minPrem,    setMinPrem]    = useState(0)
  const [lastScan,   setLastScan]   = useState(null)

  async function runScan() {
    setLoading(true)
    setError(null)
    try {
      const d = await backendFlowScan(100)
      setData(d)
      setSymFilter(null)
      setLastScan(new Date().toLocaleTimeString())
    } catch {
      setError('Backend not available — start server with: cd server && uvicorn main:app --reload')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runScan() }, [])

  const allFlow = data?.flow || []

  // Build symbol bias map from backend data (already computed server-side)
  const symbolBias = data?.symbolBias || {}

  // Filtered rows
  const rows = allFlow
    .filter(r => typeFilter === 'all' || r.type === typeFilter)
    .filter(r => !symFilter || r.symbol === symFilter)
    .filter(r => r.premium >= minPrem)

  const totalPremium = rows.reduce((s, r) => s + r.premium, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Controls */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Unusual Options Flow</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Vol/OI &gt; 2× · sorted by premium · {allFlow.length} signals across {Object.keys(symbolBias).length} symbols
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={runScan} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? <><span className="spinner" style={{ marginRight: 4 }} />Scanning...</> : '▶ Scan Flow'}
          </button>

          {/* Type filter */}
          {['all','call','put'].map(f => (
            <button key={f}
              className={`btn${typeFilter === f ? ' btn-primary' : ''}`}
              onClick={() => setTypeFilter(f)}
              style={{ fontSize: 11, color: f === 'call' ? 'var(--green-text)' : f === 'put' ? 'var(--red-text)' : undefined }}
            >
              {f === 'all' ? 'All' : f === 'call' ? 'Calls' : 'Puts'}
            </button>
          ))}

          {/* Min premium */}
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Min $
            <select value={minPrem} onChange={e => setMinPrem(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 6px' }}>
              <option value={0}>Any</option>
              <option value={5000}>$5K</option>
              <option value={10000}>$10K</option>
              <option value={50000}>$50K</option>
              <option value={100000}>$100K</option>
            </select>
          </label>

          {lastScan && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Scanned {lastScan}</span>}
        </div>
        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 'var(--r-md)' }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Symbol Bias Summary ── one card per symbol, clickable to filter */}
      {Object.keys(symbolBias).length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>
            Symbol flow bias — click to filter table · green = call-heavy · red = put-heavy
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(symbolBias)
              .sort((a, b) => (b[1].callPremium + b[1].putPremium) - (a[1].callPremium + a[1].putPremium))
              .map(([sym, info]) => (
                <SymbolBiasCard
                  key={sym}
                  sym={sym}
                  info={info}
                  active={symFilter === sym}
                  onClick={() => setSymFilter(symFilter === sym ? null : sym)}
                />
              ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: `${rows.filter(r => r.type==='call').length} calls`, color: 'var(--green-text)', bg: 'var(--green-dim)' },
            { label: `${rows.filter(r => r.type==='put').length} puts`,   color: 'var(--red-text)',   bg: 'var(--red-dim)'   },
            { label: `${rows.length} contracts`,                           color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)' },
            { label: `${fmtPremium(totalPremium)} flow`,                   color: 'var(--blue)', bg: 'var(--blue-dim)' },
          ].map(({ label, color, bg }) => (
            <span key={label} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: bg, color, fontWeight: 500 }}>
              {label}
            </span>
          ))}
          {symFilter && (
            <button className="btn" onClick={() => setSymFilter(null)} style={{ fontSize: 10 }}>
              ✕ {symFilter}
            </button>
          )}
        </div>
      )}

      {/* Flow table */}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Bias</th>
                  <th>Type</th>
                  <th>Strike</th>
                  <th>Expiry</th>
                  <th>DTE</th>
                  <th>Mid</th>
                  <th>Volume</th>
                  <th>OI</th>
                  <th>Vol/OI</th>
                  <th>IV</th>
                  <th>Delta</th>
                  <th>Premium</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const bias = contractBias(r)
                  return (
                    <tr key={`${r.contractSymbol}-${i}`}>
                      <td>
                        <strong
                          style={{ cursor: 'pointer', color: r.type === 'call' ? 'var(--green-text)' : 'var(--red-text)' }}
                          onClick={() => setSymFilter(symFilter === r.symbol ? null : r.symbol)}
                          title="Click to filter this symbol"
                        >
                          {r.symbol}
                        </strong>
                      </td>

                      {/* Per-contract conviction */}
                      <td>
                        <span style={{
                          fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                          background: bias.bg, color: bias.color,
                        }}>
                          {bias.label}
                        </span>
                      </td>

                      <td>
                        <span className={`badge ${r.type === 'call' ? 'badge-up' : 'badge-dn'}`} style={{ fontSize: 9 }}>
                          {r.type.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>${r.strike}</td>
                      <td style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{r.expiry}</td>
                      <td style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10,
                        color: r.daysToExpiry === 0 ? 'var(--amber-text)' : 'var(--text-secondary)',
                        fontWeight: r.daysToExpiry === 0 ? 700 : 400,
                      }}>
                        {r.daysToExpiry === 0 ? '0DTE' : r.daysToExpiry + 'd'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>${r.mid?.toFixed(2)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>
                        {r.volume?.toLocaleString()}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                        {r.openInterest?.toLocaleString()}
                      </td>
                      <td style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                        color: r.volOiRatio >= 5 ? 'var(--amber-text)' : 'var(--text-primary)',
                      }}>
                        {r.volOiRatio?.toFixed(1)}×
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.impliedVolatility?.toFixed(1)}%</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                        {r.delta != null ? r.delta.toFixed(2) : '—'}
                      </td>
                      <td style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                        color: r.type === 'call' ? 'var(--green-text)' : 'var(--red-text)',
                      }}>
                        {fmtPremium(r.premium)}
                      </td>
                      <td>
                        <button className="btn" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => onAnalyze(r.symbol)}>
                          Analyze
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>No unusual flow found with current filters</div>
          <div style={{ fontSize: 11 }}>Try lowering the minimum premium or clicking Scan Flow</div>
        </div>
      )}
    </div>
  )
}
