import { useState, useEffect } from 'react'

export default function ExportTab({ initialPlan }) {
  const [format, setFormat] = useState('json')
  const [content, setContent] = useState('')

  useEffect(() => {
    if (initialPlan) {
      if (format === 'json') {
        setContent(JSON.stringify(initialPlan, null, 2))
      } else if (format === 'csv') {
        const ticker = initialPlan.ticker || 'N/A'
        const price = initialPlan.quote?.regularMarketPrice || 'N/A'
        const change = initialPlan.quote?.regularMarketChangePercent || 'N/A'
        setContent(`Ticker,Price,Change%\n${ticker},${price},${change}`)
      }
    }
  }, [initialPlan, format])

  function download() {
    const link = document.createElement('a')
    const ext = format === 'json' ? 'json' : 'csv'
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
    link.download = `export.${ext}`
    link.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ── Format selector ────────────────────────────────– */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
        <button className="btn btn-primary" onClick={download} disabled={!content}>
          Download
        </button>
      </div>

      {/* ── Content preview ────────────────────────────────– */}
      <div className="card">
        <div className="panel-title">Export Preview</div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            width: '100%',
            height: '300px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            padding: '10px',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            resize: 'none',
          }}
        />
      </div>

      {!content && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
          Analyze a stock to generate export data
        </div>
      )}
    </div>
  )
}

