import { useState, useEffect } from 'react'
import { backendScan, backendScanCached } from '../api/backend.js'
import { fmtPrice, fmtPct, chgColor } from '../utils/helpers.js'

const DEFAULT_SYMBOLS = [
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','PLTR','COIN',
  'JPM','GS','BAC','SPY','QQQ','IWM','XLK','XLF','XLE',
  'CRWD','NET','SNOW','DDOG','MDB',
]

const SIGNAL_COLOR = {
  STRONG_BUY: 'var(--green-text)',
  BUY:        'var(--green-text)',
  NEUTRAL:    'var(--amber-text)',
  SELL:       'var(--red-text)',
  STRONG_SELL:'var(--red-text)',
}

const SIGNAL_BADGE = {
  STRONG_BUY: 'badge-up',
  BUY:        'badge-up',
  NEUTRAL:    'badge-warn',
  SELL:       'badge-dn',
  STRONG_SELL:'badge-dn',
}

function ScoreBar({ score }) {
  const pct  = Math.max(0, Math.min(100, score))
  const color = pct >= 70 ? 'var(--green)' : pct >= 45 ? 'var(--amber)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-tertiary)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color, minWidth: 26, textAlign: 'right' }}>
        {score?.toFixed(0)}
      </span>
    </div>
  )
}

export default function ScannerTab({ onAnalyze, preset = null, onPresetConsumed }) {
  const [symbols,   setSymbols]   = useState(DEFAULT_SYMBOLS.join(', '))
  const [minScore,  setMinScore]  = useState(0)
  const [results,   setResults]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [scannedAt, setScannedAt] = useState(null)
  const [expanded,  setExpanded]  = useState(null)
  const [presetLabel, setPresetLabel] = useState(null)

  // When a sector preset arrives, load it and auto-run
  useEffect(() => {
    if (!preset?.symbols?.length) return
    const symStr = preset.symbols.join(', ')
    setSymbols(symStr)
    setPresetLabel(preset.label)
    setResults([])
    setScannedAt(null)
    if (onPresetConsumed) onPresetConsumed()
    // Auto-run after state settles
    setTimeout(() => {
      const syms = preset.symbols.map(s => s.trim().toUpperCase()).filter(Boolean)
      setLoading(true)
      setError(null)
      backendScan(syms, 0)
        .then(data => {
          setResults(data.results || [])
          setScannedAt(new Date().toLocaleTimeString())
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
    }, 50)
  }, [preset])

  async function runScan() {
    const syms = symbols.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    if (!syms.length) return
    setLoading(true)
    setError(null)
    try {
      const data = await backendScan(syms, minScore)
      setResults(data.results || [])
      setScannedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setError(e.message.includes('Backend') ? 'Python server not running. Start it with: cd server && uvicorn main:app --reload' : e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadCached() {
    setLoading(true)
    setError(null)
    try {
      const data = await backendScanCached(minScore)
      if (!data.results?.length) {
        setError('No cached results — run a scan first.')
      } else {
        setResults(data.results)
        setScannedAt('cached')
      }
    } catch (e) {
      setError('Backend not available.')
    } finally {
      setLoading(false)
    }
  }

  const buys    = results.filter(r => r.signal === 'BUY' || r.signal === 'STRONG_BUY')
  const neutral = results.filter(r => r.signal === 'NEUTRAL')
  const sells   = results.filter(r => r.signal === 'SELL' || r.signal === 'STRONG_SELL')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Controls */}
      <div className="card">
        <div className="panel-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="panel-title">Market Scanner</span>
            {presetLabel && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--blue-dim)', color: 'var(--blue)', fontWeight: 500 }}>
                {presetLabel}
              </span>
            )}
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            5-condition scoring (Trend, RSI, MACD, Volume, Breakout)
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={symbols}
            onChange={e => setSymbols(e.target.value)}
            rows={3}
            placeholder="Enter symbols separated by commas or spaces..."
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Min score
              <input
                type="number" value={minScore} min={0} max={100} step={5}
                onChange={e => setMinScore(Number(e.target.value))}
                style={{ width: 60, fontSize: 11 }}
              />
            </label>
            <button className="btn btn-primary" onClick={runScan} disabled={loading} style={{ fontSize: 11 }}>
              {loading ? <><span className="spinner" style={{ marginRight: 4 }} />Scanning...</> : '▶ Run Scan'}
            </button>
            <button className="btn" onClick={loadCached} disabled={loading} style={{ fontSize: 11 }}>
              ↺ Load cached
            </button>
            {scannedAt && (
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {results.length} results · {scannedAt}
              </span>
            )}
          </div>
          {error && (
            <div style={{ fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 'var(--r-md)' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <>
          {/* Summary pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: `${buys.length} BUY`,     color: 'var(--green-text)', bg: 'var(--green-dim)'  },
              { label: `${neutral.length} NEUTRAL`, color: 'var(--amber-text)', bg: 'var(--amber-dim)' },
              { label: `${sells.length} SELL`,    color: 'var(--red-text)',   bg: 'var(--red-dim)'   },
              { label: `${results.length} total`, color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)' },
            ].map(({ label, color, bg }) => (
              <span key={label} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: bg, color, fontWeight: 500 }}>
                {label}
              </span>
            ))}
          </div>

          {/* Results table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Score</th>
                  <th>Signal</th>
                  <th>Price</th>
                  <th>Chg%</th>
                  <th>Volume</th>
                  <th>RSI</th>
                  <th>MACD</th>
                  <th>Trend</th>
                  <th>Vol×</th>
                  <th>Stop</th>
                  <th>Target</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <>
                    <tr key={r.symbol} style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === r.symbol ? null : r.symbol)}>
                      <td><strong style={{ color: SIGNAL_COLOR[r.signal] }}>{r.symbol}</strong></td>
                      <td><ScoreBar score={r.score} /></td>
                      <td><span className={`badge ${SIGNAL_BADGE[r.signal] || 'badge-warn'}`}>{r.signal?.replace('_', ' ')}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.price ? fmtPrice(r.price) : '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: r.change_pct > 0 ? 'var(--green-text)' : r.change_pct < 0 ? 'var(--red-text)' : 'var(--text-secondary)' }}>
                        {r.change_pct != null ? `${r.change_pct > 0 ? '+' : ''}${r.change_pct.toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                        {r.volume ? (r.volume >= 1e6 ? `${(r.volume/1e6).toFixed(1)}M` : r.volume >= 1e3 ? `${(r.volume/1e3).toFixed(0)}K` : r.volume) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: r.rsi > 70 ? 'var(--red-text)' : r.rsi < 30 ? 'var(--green-text)' : 'var(--text-primary)' }}>
                        {r.rsi?.toFixed(1) ?? '—'}
                      </td>
                      <td>
                        <span className={`badge ${r.macd_signal === 'BULLISH' ? 'badge-up' : 'badge-dn'}`} style={{ fontSize: 9 }}>
                          {r.macd_signal}
                        </span>
                      </td>
                      <td style={{ fontSize: 10, color: r.trend === 'UPTREND' ? 'var(--green-text)' : r.trend === 'DOWNTREND' ? 'var(--red-text)' : 'var(--amber-text)' }}>
                        {r.trend}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{r.volume_ratio?.toFixed(1) ?? '—'}×</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--red-text)', fontSize: 10 }}>{r.stop_loss ? fmtPrice(r.stop_loss) : '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green-text)', fontSize: 10 }}>{r.take_profit ? fmtPrice(r.take_profit) : '—'}</td>
                      <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
                        <button className="btn" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => onAnalyze(r.symbol)}>Analyze</button>
                        <button className="btn" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => setExpanded(expanded === r.symbol ? null : r.symbol)}>
                          {expanded === r.symbol ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>
                    {expanded === r.symbol && (
                      <tr key={`${r.symbol}-detail`}>
                        <td colSpan={13} style={{ padding: '8px 12px', background: 'var(--bg-secondary)' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                            {(r.reasons || []).map((line, i) => (
                              <div key={i} style={{ color: line.startsWith('✅') ? 'var(--green-text)' : line.startsWith('❌') ? 'var(--red-text)' : line.startsWith('⚠') ? 'var(--amber-text)' : 'var(--text-secondary)' }}>
                                {line}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!results.length && !loading && !error && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Enter symbols above and click Run Scan</div>
          <div style={{ fontSize: 11 }}>
            Requires the Python server: <code style={{ background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3 }}>cd server && uvicorn main:app --reload</code>
          </div>
        </div>
      )}
    </div>
  )
}
