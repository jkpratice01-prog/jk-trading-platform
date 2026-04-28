import { useState, useEffect } from 'react'
import { backendMultiTimeframe } from '../api/backend.js'

const TF_LABELS = { daily: '1D', hourly: '1H', '15min': '15m' }

function SignalBadge({ signal }) {
  const cls = signal === 'BULLISH' ? 'badge-up' : signal === 'BEARISH' ? 'badge-dn' : 'badge-warn'
  return <span className={`badge ${cls}`} style={{ fontSize: 9 }}>{signal}</span>
}

function TFRow({ label, data }) {
  if (!data) return (
    <tr>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{label}</td>
      <td colSpan={6} style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>No data</td>
    </tr>
  )
  return (
    <tr>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{label}</td>
      <td><SignalBadge signal={data.signal} /></td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{data.score}</td>
      <td style={{ fontSize: 10, color: data.trend === 'UPTREND' ? 'var(--green-text)' : data.trend === 'DOWNTREND' ? 'var(--red-text)' : 'var(--amber-text)' }}>
        {data.trend}
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: (data.rsi||50) > 70 ? 'var(--red-text)' : (data.rsi||50) < 30 ? 'var(--green-text)' : 'var(--text-primary)' }}>
        {data.rsi?.toFixed(1) ?? '—'}
      </td>
      <td>
        {data.macdBull != null && (
          <span className={`badge ${data.macdBull ? 'badge-up' : 'badge-dn'}`} style={{ fontSize: 9 }}>
            {data.macdBull ? 'BULL' : 'BEAR'}
          </span>
        )}
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
        {data.volRatio?.toFixed(1)}×
      </td>
    </tr>
  )
}

const ALIGN_COLORS = {
  FULL_BULL:   'var(--green-text)',
  MOSTLY_BULL: 'var(--green-text)',
  FULL_BEAR:   'var(--red-text)',
  MOSTLY_BEAR: 'var(--red-text)',
  MIXED:       'var(--amber-text)',
  NO_DATA:     'var(--text-tertiary)',
}

export default function MultiTimeframe({ symbol }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    backendMultiTimeframe(symbol)
      .then(setData)
      .catch(() => setError('Failed to load multi-TF data'))
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) return (
    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
      <span className="spinner" style={{ marginRight: 4 }} />Analyzing timeframes...
    </div>
  )
  if (error) return <div style={{ fontSize: 11, color: 'var(--red-text)', padding: 8 }}>{error}</div>
  if (!data) return null

  const tfs = data.timeframes || {}
  const alignColor = ALIGN_COLORS[data.alignment] || 'var(--text-secondary)'
  const alignLabel = data.alignment?.replace('_', ' ')

  return (
    <div>
      {/* Alignment summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: alignColor }}>
          {alignLabel}
        </span>
        <div style={{ flex: 1, maxWidth: 120, height: 4, borderRadius: 2, background: 'var(--bg-tertiary)' }}>
          <div style={{
            width: `${data.alignmentScore}%`, height: '100%', borderRadius: 2,
            background: data.alignmentScore >= 60 ? 'var(--green)' : data.alignmentScore <= 40 ? 'var(--red)' : 'var(--amber)',
            transition: 'width .3s',
          }} />
        </div>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {data.bullCount}/{(data.bullCount||0) + (data.bearCount||0)} TFs bullish
        </span>
      </div>

      {/* Per-timeframe table */}
      <table className="data-table">
        <thead>
          <tr>
            <th>TF</th>
            <th>Signal</th>
            <th>Score</th>
            <th>Trend</th>
            <th>RSI</th>
            <th>MACD</th>
            <th>Vol×</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(tfs).map(([key, val]) => (
            <TFRow key={key} label={TF_LABELS[key] || key} data={val} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
