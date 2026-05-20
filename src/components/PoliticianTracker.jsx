import { useState, useEffect, useCallback } from 'react'
import { backendPoliticianTrades, backendPoliticianStats } from '../api/backend.js'

const PARTY_COLOR = {
  D: '#4a9eff',
  Democrat: '#4a9eff',
  R: '#ff5252',
  Republican: '#ff5252',
  I: '#c084fc',
  Independent: '#c084fc',
}

function partyColor(party) {
  if (!party) return 'var(--text-secondary)'
  const k = Object.keys(PARTY_COLOR).find(k => party.toUpperCase().startsWith(k.toUpperCase()))
  return k ? PARTY_COLOR[k] : 'var(--text-secondary)'
}

function partyBadge(party) {
  if (!party) return '?'
  if (party.toUpperCase().startsWith('D')) return 'D'
  if (party.toUpperCase().startsWith('R')) return 'R'
  if (party.toUpperCase().startsWith('I')) return 'I'
  return party.slice(0, 1).toUpperCase()
}

function txColor(type) {
  if (!type) return 'var(--text-secondary)'
  const t = type.toLowerCase()
  if (t.includes('purchase') || t.includes('buy')) return 'var(--green-text)'
  if (t.includes('sale') || t.includes('sell'))    return 'var(--red-text)'
  return 'var(--amber-text)'
}

function txLabel(type) {
  if (!type) return '?'
  const t = type.toLowerCase()
  if (t.includes('purchase') || t.includes('buy')) return '▲ BUY'
  if (t.includes('sale_full'))                      return '▼ SELL FULL'
  if (t.includes('sale_partial'))                   return '▼ SELL PART'
  if (t.includes('sale') || t.includes('sell'))     return '▼ SELL'
  return type
}

function StatBox({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 90,
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--r-md)',
      padding: '10px 14px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function PoliticianTracker({ onAnalyze }) {
  const [ticker,    setTicker]    = useState('')
  const [chamber,   setChamber]   = useState('all')
  const [txType,    setTxType]    = useState('all')
  const [days,      setDays]      = useState(90)
  const [trades,    setTrades]    = useState([])
  const [stats,     setStats]     = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [tickerInput, setTickerInput] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [tradesRes, statsRes] = await Promise.all([
        backendPoliticianTrades({ ticker: ticker || undefined, chamber, txType, days }),
        backendPoliticianStats({ ticker: ticker || undefined, days }),
      ])
      setTrades(tradesRes.trades || [])
      setStats(statsRes)
    } catch (e) {
      // extract FastAPI detail message if present
      const msg = e?.detail || e?.message || 'Failed to load'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [ticker, chamber, txType, days])

  useEffect(() => { load() }, [load])

  function handleTickerSearch(e) {
    e.preventDefault()
    setTicker(tickerInput.trim().toUpperCase())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🏛️ Politician Trades</h2>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            STOCK Act disclosures — House &amp; Senate (public data, up to 45-day lag)
          </div>
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading} style={{ fontSize: 11, padding: '5px 14px' }}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <form onSubmit={handleTickerSearch} style={{ display: 'flex', gap: 4 }}>
          <input
            value={tickerInput}
            onChange={e => setTickerInput(e.target.value.toUpperCase())}
            placeholder="Filter ticker…"
            style={{ fontSize: 12, padding: '4px 10px', width: 120, borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
          <button type="submit" className="btn" style={{ fontSize: 11, padding: '4px 10px' }}>Go</button>
          {ticker && (
            <button type="button" className="btn" onClick={() => { setTicker(''); setTickerInput('') }} style={{ fontSize: 11, padding: '4px 8px' }}>✕</button>
          )}
        </form>

        <select value={chamber} onChange={e => setChamber(e.target.value)} style={{ fontSize: 11, padding: '4px 10px' }}>
          <option value="all">All Chambers</option>
          <option value="house">House</option>
          <option value="senate">Senate</option>
        </select>

        <select value={txType} onChange={e => setTxType(e.target.value)} style={{ fontSize: 11, padding: '4px 10px' }}>
          <option value="all">All Types</option>
          <option value="purchase">Purchases</option>
          <option value="sale">Sales</option>
        </select>

        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ fontSize: 11, padding: '4px 10px' }}>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
          <option value={365}>1 year</option>
          <option value={0}>All time</option>
        </select>

        {ticker && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', padding: '3px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)' }}>
            {ticker}
          </span>
        )}
      </div>

      {/* Stats row */}
      {stats && !loading && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatBox label="Total Trades" value={stats.total} />
          <StatBox label="Purchases" value={stats.buys} color="var(--green-text)" />
          <StatBox label="Sales" value={stats.sells} color="var(--red-text)" />
          {stats.top_buyers?.length > 0 && (
            <div style={{ flex: 2, minWidth: 200, background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>TOP BUYERS</div>
              {stats.top_buyers.map(([name, cnt]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{name}</span>
                  <span style={{ color: 'var(--green-text)', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{cnt}x</span>
                </div>
              ))}
            </div>
          )}
          {stats.top_sellers?.length > 0 && (
            <div style={{ flex: 2, minWidth: 200, background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>TOP SELLERS</div>
              {stats.top_sellers.map(([name, cnt]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{name}</span>
                  <span style={{ color: 'var(--red-text)', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{cnt}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error / setup instructions */}
      {error && (
        <div style={{ background: 'var(--bg-secondary)', borderLeft: '3px solid var(--amber-text)', borderRadius: 'var(--r-md)', padding: '14px 16px', fontSize: 12 }}>
          {error.toLowerCase().includes('fmp_api_key') || error.toLowerCase().includes('financialmodelingprep') ? (
            <div>
              <div style={{ fontWeight: 700, color: 'var(--amber-text)', marginBottom: 8 }}>⚙️ API Key Required</div>
              <div style={{ color: 'var(--text-primary)', marginBottom: 6 }}>
                Politician trade data uses the <strong>Financial Modeling Prep</strong> free API (250 req/day).
              </div>
              <ol style={{ margin: '8px 0 0 16px', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                <li>Register free at <strong>financialmodelingprep.com/register</strong></li>
                <li>Copy your API key</li>
                <li>Add to <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3 }}>server/.env</code>:
                  <code style={{ display: 'block', margin: '4px 0', background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: 4, color: 'var(--green-text)' }}>
                    FMP_API_KEY=your_key_here
                  </code>
                </li>
                <li>Restart the backend server</li>
              </ol>
            </div>
          ) : (
            <span style={{ color: 'var(--red-text)' }}>{error}</span>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontSize: 13 }}>
          Fetching STOCK Act disclosures… (first load may take 10–30s)
        </div>
      )}

      {/* Table */}
      {!loading && !error && trades.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontSize: 13 }}>
          No trades found for current filters.
        </div>
      )}

      {!loading && trades.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' }}>Politician</th>
                <th style={{ textAlign: 'center', padding: '6px 8px' }}>Party</th>
                <th style={{ textAlign: 'center', padding: '6px 8px' }}>Chamber</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Ticker</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Asset</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', whiteSpace: 'nowrap' }}>Type</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Amount</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', whiteSpace: 'nowrap' }}>Disclosed</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-faint, var(--border))', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {t.tx_date ? t.tx_date.slice(0, 10) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-primary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.politician || '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: partyColor(t.party),
                      background: 'var(--bg-tertiary)',
                      padding: '2px 7px', borderRadius: 10,
                    }}>
                      {partyBadge(t.party)}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {t.chamber}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <button
                      className="btn"
                      onClick={() => onAnalyze && onAnalyze(t.ticker)}
                      style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', color: 'var(--blue)' }}
                    >
                      {t.ticker}
                    </button>
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.asset || '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <span style={{ color: txColor(t.tx_type), fontWeight: 600, fontSize: 11 }}>
                      {txLabel(t.tx_type)}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 11 }}>
                    {t.amount || '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontSize: 11 }}>
                    {t.disclosed ? t.disclosed.slice(0, 10) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'right', marginTop: 6 }}>
            Showing {trades.length} trades · Data: housestockwatcher.com + senatestockwatcher.com
          </div>
        </div>
      )}
    </div>
  )
}