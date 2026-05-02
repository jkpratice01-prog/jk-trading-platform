import { useState, useEffect } from 'react'
import { backendInstitutionalFlow, backendInstitutionalFlowSymbol } from '../api/backend.js'

function fmtVolume(n) {
  if (n == null) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toLocaleString()
}

function getFlowColor(flowType) {
  switch (flowType) {
    case 'INSTITUTIONAL_BUYING':  return 'var(--green-text)'
    case 'INSTITUTIONAL_SELLING': return 'var(--red-text)'
    case 'HIGH_VOLUME_NEUTRAL':   return 'var(--amber-text)'
    default:                      return 'var(--text-secondary)'
  }
}

function FlowBadge({ type }) {
  const label = type?.replace(/_/g, ' ') || 'UNKNOWN'
  return (
    <span style={{
      fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
      background: 'var(--bg-tertiary)', color: getFlowColor(type),
    }}>
      {label}
    </span>
  )
}

function SelectedSymbolPanel({ flow, onAnalyze, onClose }) {
  if (!flow) return null

  const hasError = !!flow.error

  return (
    <div className="card" style={{ borderLeft: `3px solid ${getFlowColor(flow.flowType)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginRight: 10 }}>
            {flow.symbol}
          </span>
          {!hasError && <FlowBadge type={flow.flowType} />}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!hasError && (
            <button className="btn btn-primary" style={{ fontSize: 10, padding: '3px 10px' }} onClick={() => onAnalyze(flow.symbol)}>
              Open Analyzer
            </button>
          )}
          <button className="btn" style={{ fontSize: 10, padding: '3px 10px' }} onClick={onClose}>✕ Close</button>
        </div>
      </div>

      {hasError ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          No unusual institutional activity detected for <strong>{flow.symbol}</strong>. Volume is within normal range.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <Stat label="Price" value={`$${flow.price?.toFixed(2)}`} />
          <Stat
            label="Price Change"
            value={`${flow.priceChange >= 0 ? '+' : ''}${flow.priceChange?.toFixed(2)}%`}
            color={flow.priceChange >= 0 ? 'var(--green-text)' : 'var(--red-text)'}
          />
          <Stat label="Volume" value={fmtVolume(flow.volume)} />
          <Stat label="Avg Volume" value={fmtVolume(flow.avgVolume)} />
          <Stat
            label="Vol Ratio"
            value={`${flow.volumeRatio?.toFixed(1)}×`}
            color={flow.volumeRatio >= 2 ? 'var(--amber-text)' : undefined}
          />
          <Stat label="Confidence" value={`${flow.confidence}%`} color={getFlowColor(flow.flowType)} />
          {flow.topHolder && <Stat label="Top Holder" value={flow.topHolder} wide />}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color, wide }) {
  return (
    <div style={{
      padding: '8px 12px',
      background: 'var(--bg-tertiary)',
      borderRadius: 6,
      border: '0.5px solid var(--border-subtle)',
      gridColumn: wide ? 'span 2' : undefined,
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

export default function InstitutionalFlowTracker({ onAnalyze }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchSymbol, setSearchSymbol] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [lastScan, setLastScan] = useState(null)

  async function runScan() {
    setLoading(true)
    setError(null)
    try {
      const d = await backendInstitutionalFlow()
      setData(d)
      setLastScan(new Date().toLocaleTimeString())
    } catch {
      setError('Failed to load institutional flow data')
    } finally {
      setLoading(false)
    }
  }

  async function searchSymbolFlow() {
    const sym = searchSymbol.trim().toUpperCase()
    if (!sym) return
    setLoading(true)
    setError(null)
    try {
      const d = await backendInstitutionalFlowSymbol(sym)
      setSelectedSymbol(d)
    } catch {
      setError(`No data available for ${sym}`)
      setSelectedSymbol(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runScan() }, [])

  const flows = data?.flows || []
  const summary = data?.summary || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">🏦 Institutional Flow Tracker</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Detects unusual volume + price signals that indicate institutional activity · {flows.length} flagged
          </span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
          Based on volume vs 3-month average. 2×+ volume with directional price move = institutional fingerprint.
          Top institutional holder shown per symbol (from latest 13F filing).
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={runScan} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? 'Scanning...' : '🔄 Scan Flow'}
          </button>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
              placeholder="Search symbol (e.g., AAPL)"
              onKeyDown={(e) => e.key === 'Enter' && searchSymbolFlow()}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '0.5px solid var(--border-subtle)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 11,
                width: 160,
              }}
            />
            <button className="btn" onClick={searchSymbolFlow} disabled={loading || !searchSymbol.trim()} style={{ fontSize: 11 }}>
              Search
            </button>
          </div>

          {lastScan && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Scanned {lastScan}</span>}
        </div>

        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 'var(--r-md)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Selected symbol detail */}
      {selectedSymbol && (
        <SelectedSymbolPanel
          flow={selectedSymbol}
          onAnalyze={onAnalyze}
          onClose={() => setSelectedSymbol(null)}
        />
      )}

      {/* Flow Summary */}
      {Object.keys(summary).length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>Flow summary by type</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(summary).map(([type, items]) => (
              <div key={type} style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: 'var(--bg-tertiary)',
                border: '0.5px solid var(--border-subtle)',
                fontSize: 11,
                color: getFlowColor(type),
                fontWeight: 600,
              }}>
                {type.replace(/_/g, ' ')}: {items.length}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flow Table */}
      {flows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Flow Type</th>
                  <th>Confidence</th>
                  <th>Volume</th>
                  <th>Vol Ratio</th>
                  <th>Price</th>
                  <th>Change</th>
                  <th>Top Holder</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {flows.map((flow) => (
                  <tr
                    key={flow.symbol}
                    style={{ cursor: 'pointer', background: selectedSymbol?.symbol === flow.symbol ? 'var(--bg-tertiary)' : undefined }}
                    onClick={() => setSelectedSymbol(flow)}
                  >
                    <td>
                      <strong style={{ color: getFlowColor(flow.flowType) }}>
                        {flow.symbol}
                      </strong>
                    </td>

                    <td><FlowBadge type={flow.flowType} /></td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: getFlowColor(flow.flowType) }}>
                      {flow.confidence}%
                    </td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {fmtVolume(flow.volume)}
                    </td>

                    <td style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                      color: flow.volumeRatio >= 2 ? 'var(--amber-text)' : 'var(--text-primary)',
                    }}>
                      {flow.volumeRatio?.toFixed(1)}×
                    </td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      ${flow.price?.toFixed(2)}
                    </td>

                    <td style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                      color: flow.priceChange >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                    }}>
                      {flow.priceChange >= 0 ? '+' : ''}{flow.priceChange?.toFixed(2)}%
                    </td>

                    <td style={{ fontSize: 10, color: 'var(--text-tertiary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {flow.topHolder || '—'}
                    </td>

                    <td>
                      <button
                        className="btn"
                        style={{ fontSize: 9, padding: '2px 6px' }}
                        onClick={(e) => { e.stopPropagation(); onAnalyze(flow.symbol) }}
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && flows.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>No unusual institutional activity detected</div>
          <div style={{ fontSize: 11 }}>All scanned symbols are trading within normal volume ranges. Try clicking Scan Flow to refresh.</div>
        </div>
      )}
    </div>
  )
}
