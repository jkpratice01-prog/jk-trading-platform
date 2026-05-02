import { useState, useEffect } from 'react'
import { backendEarningsFlow } from '../api/backend.js'

function fmtVol(n) {
  if (n == null) return '—'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toLocaleString()
}

function dirColor(dir) {
  if (dir === 'BULLISH')  return 'var(--green-text)'
  if (dir === 'BEARISH')  return 'var(--red-text)'
  return 'var(--amber-text)'
}

function dirIcon(dir) {
  if (dir === 'BULLISH')  return '▲'
  if (dir === 'BEARISH')  return '▼'
  return '◆'
}

function ScoreMeter({ score }) {
  const color = score >= 70 ? 'var(--green-text)' : score >= 45 ? 'var(--amber-text)' : 'var(--text-tertiary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 48, height: 5, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color }}>{score}</span>
    </div>
  )
}

function DetailPanel({ row, onAnalyze, onClose }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${dirColor(row.direction)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{row.symbol}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
            background: 'var(--bg-tertiary)', color: dirColor(row.direction),
          }}>
            {dirIcon(row.direction)} {row.direction}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Earnings {row.earningsDate} · {row.daysToEarnings === 1 ? 'tomorrow' : `in ${row.daysToEarnings} days`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-primary" style={{ fontSize: 10, padding: '3px 10px' }} onClick={() => onAnalyze(row.symbol)}>
            Open Analyzer
          </button>
          <button className="btn" style={{ fontSize: 10, padding: '3px 10px' }} onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Key metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Price',            value: `$${row.price?.toFixed(2)}` },
          { label: 'C/P Ratio',        value: `${row.cpRatio}×`,          color: row.cpRatio >= 2 ? 'var(--green-text)' : row.cpRatio <= 0.6 ? 'var(--red-text)' : undefined },
          { label: 'Call Volume',      value: fmtVol(row.callVolume) },
          { label: 'Put Volume',       value: fmtVol(row.putVolume) },
          { label: 'Call Vol/OI',      value: `${row.callVolOI}×`,        color: row.callVolOI >= 1 ? 'var(--green-text)' : undefined },
          { label: 'Stock Vol Ratio',  value: `${row.stockVolRatio}×`,    color: row.stockVolRatio >= 2 ? 'var(--amber-text)' : undefined },
          { label: 'Avg Call IV',      value: row.avgCallIV ? `${row.avgCallIV}%` : '—' },
          { label: 'Expiry Used',      value: row.expiry },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, border: '0.5px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
        {row.hotStrike && (
          <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, border: '0.5px solid var(--amber)', gridColumn: 'span 2' }}>
            <div style={{ fontSize: 9, color: 'var(--amber-text)', marginBottom: 3 }}>HOT STRIKE (targeted bet)</div>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--amber-text)' }}>
              ${row.hotStrike?.toFixed(0)} call · {fmtVol(row.hotStrikeVol)} contracts
            </div>
          </div>
        )}
      </div>

      {/* Signals */}
      {row.signals?.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>Detected signals</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {row.signals.map((sig, i) => (
              <div key={i} style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 5,
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                borderLeft: `2px solid ${dirColor(row.direction)}`,
              }}>
                {sig}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function EarningsFlowScanner({ onAnalyze }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [daysAhead, setDaysAhead] = useState(21)
  const [selected, setSelected] = useState(null)
  const [lastScan, setLastScan] = useState(null)
  const [filterDir, setFilterDir] = useState('ALL')

  async function runScan() {
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const d = await backendEarningsFlow(daysAhead)
      setData(d)
      setLastScan(new Date().toLocaleTimeString())
    } catch {
      setError('Scan failed — check backend is running')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runScan() }, [])

  const results = (data?.results || []).filter(r => filterDir === 'ALL' || r.direction === filterDir)

  const bullish = data?.results?.filter(r => r.direction === 'BULLISH').length || 0
  const bearish = data?.results?.filter(r => r.direction === 'BEARISH').length || 0
  const neutral = data?.results?.filter(r => r.direction === 'NEUTRAL').length || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">📅 Pre-Earnings Institutional Flow</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Detects institutional positioning before earnings · {data?.count ?? 0} signals found
          </span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10, lineHeight: 1.6 }}>
          Institutions buy calls (or stock) quietly before expected strong earnings.
          This scanner flags: <strong style={{ color: 'var(--text-primary)' }}>C/P ratio spikes</strong>,{' '}
          <strong style={{ color: 'var(--text-primary)' }}>Call Vol &gt; Open Interest</strong> (new positions, not closing),{' '}
          <strong style={{ color: 'var(--text-primary)' }}>unusual stock volume</strong>, and{' '}
          <strong style={{ color: 'var(--text-primary)' }}>targeted single-strike bets</strong>.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={runScan} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? 'Scanning...' : '🔄 Scan Now'}
          </button>

          <select
            value={daysAhead}
            onChange={e => setDaysAhead(Number(e.target.value))}
            style={{ fontSize: 11, padding: '5px 8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}
          >
            <option value={3}>Next 3 days</option>
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={21}>Next 21 days</option>
          </select>

          {/* Direction filter */}
          {['ALL', 'BULLISH', 'BEARISH', 'NEUTRAL'].map(d => (
            <button
              key={d}
              className="btn"
              onClick={() => setFilterDir(d)}
              style={{
                fontSize: 10, padding: '3px 10px',
                background: filterDir === d ? 'var(--bg-tertiary)' : 'transparent',
                color: d === 'BULLISH' ? 'var(--green-text)' : d === 'BEARISH' ? 'var(--red-text)' : d === 'NEUTRAL' ? 'var(--amber-text)' : 'var(--text-secondary)',
                fontWeight: filterDir === d ? 700 : 400,
                border: filterDir === d ? '0.5px solid var(--border-subtle)' : 'none',
              }}
            >
              {d}
            </button>
          ))}

          {lastScan && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Scanned {lastScan}</span>}
        </div>

        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 'var(--r-md)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Summary chips */}
      {data && (
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Bullish Positioning', count: bullish, color: 'var(--green-text)' },
            { label: 'Bearish Positioning', count: bearish, color: 'var(--red-text)' },
            { label: 'Neutral / Mixed',     count: neutral, color: 'var(--amber-text)' },
          ].map(({ label, count, color }) => (
            <div key={label} style={{
              padding: '6px 14px', borderRadius: 8,
              background: 'var(--bg-tertiary)', border: '0.5px solid var(--border-subtle)',
              fontSize: 11, color, fontWeight: 600,
            }}>
              {label}: {count}
            </div>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <DetailPanel row={selected} onAnalyze={onAnalyze} onClose={() => setSelected(null)} />
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Direction</th>
                  <th>Score</th>
                  <th>Earnings</th>
                  <th>Days</th>
                  <th>C/P Ratio</th>
                  <th>Call Vol/OI</th>
                  <th>Stock Vol</th>
                  <th>Hot Strike</th>
                  <th>Top Signal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(row => (
                  <tr
                    key={row.symbol}
                    style={{
                      cursor: 'pointer',
                      background: selected?.symbol === row.symbol ? 'var(--bg-tertiary)' : undefined,
                    }}
                    onClick={() => setSelected(row)}
                  >
                    <td>
                      <strong style={{ color: dirColor(row.direction) }}>{row.symbol}</strong>
                    </td>

                    <td>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                        background: 'var(--bg-tertiary)', color: dirColor(row.direction),
                      }}>
                        {dirIcon(row.direction)} {row.direction}
                      </span>
                    </td>

                    <td><ScoreMeter score={row.score} /></td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.earningsDate}</td>

                    <td style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                      color: row.daysToEarnings <= 2 ? 'var(--red-text)' : row.daysToEarnings <= 5 ? 'var(--amber-text)' : 'var(--text-primary)',
                    }}>
                      {row.daysToEarnings}d
                    </td>

                    <td style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                      color: row.cpRatio >= 2 ? 'var(--green-text)' : row.cpRatio <= 0.6 ? 'var(--red-text)' : 'var(--text-primary)',
                    }}>
                      {row.cpRatio}×
                    </td>

                    <td style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                      color: row.callVolOI >= 1 ? 'var(--green-text)' : 'var(--text-primary)',
                    }}>
                      {row.callVolOI}×
                    </td>

                    <td style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: row.stockVolRatio >= 2 ? 'var(--amber-text)' : 'var(--text-primary)',
                    }}>
                      {row.stockVolRatio}×
                    </td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--amber-text)', fontWeight: 600 }}>
                      {row.hotStrike ? `$${row.hotStrike.toFixed(0)}` : '—'}
                    </td>

                    <td style={{ fontSize: 10, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.signals?.[0] || '—'}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>📅</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>No pre-earnings institutional signals detected</div>
          <div style={{ fontSize: 11 }}>
            Either no symbols have earnings in the next {daysAhead} days, or options flow is within normal range.
            Try extending the window or scanning again later in the trading day.
          </div>
        </div>
      )}
    </div>
  )
}
