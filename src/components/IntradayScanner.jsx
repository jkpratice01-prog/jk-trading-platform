import { useState, useEffect } from 'react'
import { backendIntradayScan } from '../api/backend.js'

function ScoreBar({ score }) {
  const color = score >= 65 ? 'var(--green)' : score <= 35 ? 'var(--red)' : 'var(--amber)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-tertiary)' }}>
        <div style={{ width: `${score}%`, height: '100%', borderRadius: 2, background: color, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color, minWidth: 24, textAlign: 'right' }}>
        {score}
      </span>
    </div>
  )
}

export default function IntradayScanner({ onAnalyze }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [lastScan,setLastScan]= useState(null)
  const [filter,  setFilter]  = useState('all')   // 'all' | 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  const [minVol,  setMinVol]  = useState(1.0)

  async function runScan() {
    setLoading(true)
    setError(null)
    try {
      const d = await backendIntradayScan(30)
      setData(d)
      setLastScan(new Date().toLocaleTimeString())
    } catch (e) {
      setError('Backend not available — start server with: cd server && uvicorn main:app --reload')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runScan() }, [])

  const rows = (data?.results || [])
    .filter(r => filter === 'all' || r.signal === filter)
    .filter(r => r.volRatio >= minVol)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Intraday Momentum Scanner</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            5-min RSI · VWAP · Volume surge · {data?.total || 0} symbols scanned
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={runScan} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? <><span className="spinner" style={{ marginRight: 4 }} />Scanning...</> : '▶ Scan Now'}
          </button>
          {['all','BULLISH','NEUTRAL','BEARISH'].map(f => (
            <button
              key={f}
              className={`btn${filter === f ? ' btn-primary' : ''}`}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 11,
                color: f === 'BULLISH' ? 'var(--green-text)' : f === 'BEARISH' ? 'var(--red-text)' : undefined,
              }}
            >
              {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Min Vol×
            <input
              type="number" value={minVol} min={0} max={10} step={0.5}
              onChange={e => setMinVol(Number(e.target.value))}
              style={{ width: 55, fontSize: 11 }}
            />
          </label>
          {lastScan && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Last scan: {lastScan}</span>}
        </div>
        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 'var(--r-md)' }}>
            {error}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Score</th>
                <th>Signal</th>
                <th>Price</th>
                <th>VWAP</th>
                <th>RSI</th>
                <th>5-Bar Mom</th>
                <th>Vol×</th>
                <th>EMA9/21</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.symbol}>
                  <td><strong style={{ color: r.signal === 'BULLISH' ? 'var(--green-text)' : r.signal === 'BEARISH' ? 'var(--red-text)' : 'var(--amber-text)' }}>{r.symbol}</strong></td>
                  <td style={{ minWidth: 80 }}><ScoreBar score={r.score} /></td>
                  <td>
                    <span className={`badge ${r.signal === 'BULLISH' ? 'badge-up' : r.signal === 'BEARISH' ? 'badge-dn' : 'badge-warn'}`} style={{ fontSize: 9 }}>
                      {r.signal}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>${r.price?.toFixed(2)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    <span style={{ color: r.aboveVwap ? 'var(--green-text)' : 'var(--red-text)' }}>
                      ${r.vwap?.toFixed(2)} {r.aboveVwap ? '↑' : '↓'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: (r.rsi||50) > 70 ? 'var(--red-text)' : (r.rsi||50) < 30 ? 'var(--green-text)' : 'var(--text-primary)' }}>
                    {r.rsi?.toFixed(1) ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: r.mom5bar > 0 ? 'var(--green-text)' : r.mom5bar < 0 ? 'var(--red-text)' : 'var(--text-secondary)' }}>
                    {r.mom5bar > 0 ? '+' : ''}{r.mom5bar?.toFixed(2)}%
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: r.volRatio >= 2 ? 'var(--amber-text)' : 'var(--text-secondary)' }}>
                    {r.volRatio?.toFixed(1)}×
                  </td>
                  <td style={{ fontSize: 10 }}>
                    <span style={{ color: r.ema9 > r.ema21 ? 'var(--green-text)' : 'var(--red-text)' }}>
                      {r.ema9 > r.ema21 ? 'Bull ↑' : 'Bear ↓'}
                    </span>
                  </td>
                  <td>
                    <button className="btn" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => onAnalyze(r.symbol)}>
                      Analyze
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Click Scan Now to run intraday momentum scan</div>
          <div style={{ fontSize: 11 }}>Scans {data?.total || 30} symbols using 5-min VWAP, RSI, and volume data</div>
        </div>
      )}
    </div>
  )
}
