import { useState, useEffect } from 'react'
import { getQuotes, getNews } from '../api/yahooFinance.js'
import { fmtPrice, fmtPct, fmtLarge } from '../utils/helpers.js'
import VWAPPanel       from './VWAPPanel.jsx'
import CandlestickChart from './CandlestickChart.jsx'
import MultiTimeframe  from './MultiTimeframe.jsx'

export default function Analyzer({ initialTicker, onExport }) {
  const [ticker,   setTicker]   = useState(initialTicker || 'AAPL')
  const [input,    setInput]    = useState(initialTicker || 'AAPL')
  const [quote,    setQuote]    = useState(null)
  const [news,     setNews]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [tab,      setTab]      = useState('chart')   // chart | vwap | multi-tf | news

  // re-sync when parent changes initialTicker
  useEffect(() => {
    if (initialTicker && initialTicker !== ticker) {
      setTicker(initialTicker)
      setInput(initialTicker)
    }
  }, [initialTicker])

  useEffect(() => { fetchData(ticker) }, [ticker])

  async function fetchData(sym) {
    setLoading(true)
    try {
      const [q, n] = await Promise.all([
        getQuotes([sym]).then(r => r[sym] || null),
        getNews(sym),
      ])
      setQuote(q)
      setNews(n || [])
    } catch (err) {
      console.warn('Analyzer fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  function go() {
    const sym = input.trim().toUpperCase()
    if (sym) setTicker(sym)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && go()}
          placeholder="Enter ticker..."
          style={{ width: 120 }}
        />
        <button className="btn btn-primary" onClick={go} disabled={loading}>
          {loading ? <span className="spinner" /> : 'Analyze'}
        </button>
        <button className="btn" onClick={() => onExport({ ticker, quote })}>Export</button>

        {/* Sub-tabs */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {[['chart','Chart'],['vwap','VWAP'],['multi-tf','Multi-TF'],['news','News']].map(([id, label]) => (
            <button key={id} className={`btn${tab === id ? ' btn-primary' : ''}`}
              onClick={() => setTab(id)} style={{ fontSize: 11 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Quote card ─────────────────────────────────── */}
      {quote && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {quote.shortName || ticker}
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8, fontWeight: 400 }}>{ticker}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                  {fmtPrice(quote.regularMarketPrice)}
                </span>
                <span style={{ fontSize: 12, color: quote.regularMarketChangePercent >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
                  {fmtPct(quote.regularMarketChangePercent)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Market Cap', value: fmtLarge(quote.marketCap) },
                { label: 'P/E', value: quote.trailingPE?.toFixed(1) || '—' },
                { label: 'Day Range', value: `${fmtPrice(quote.regularMarketDayLow)} – ${fmtPrice(quote.regularMarketDayHigh)}` },
                { label: 'Volume', value: fmtLarge(quote.regularMarketVolume) },
                { label: 'Avg Vol', value: fmtLarge(quote.averageDailyVolume3Month) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Candlestick chart ───────────────────────────── */}
      {tab === 'chart' && (
        <div className="card">
          <div className="panel-hd" style={{ marginBottom: 8 }}>
            <span className="panel-title">Price Chart — {ticker}</span>
          </div>
          <CandlestickChart symbol={ticker} height={340} />
        </div>
      )}

      {/* ── VWAP panel ─────────────────────────────────── */}
      {tab === 'vwap' && <VWAPPanel symbol={ticker} />}

      {/* ── Multi-timeframe ────────────────────────────── */}
      {tab === 'multi-tf' && (
        <div className="card">
          <div className="panel-hd" style={{ marginBottom: 8 }}>
            <span className="panel-title">Multi-Timeframe Analysis — {ticker}</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Daily · Hourly · 15-min signal alignment</span>
          </div>
          <MultiTimeframe symbol={ticker} />
        </div>
      )}

      {/* ── News ───────────────────────────────────────── */}
      {tab === 'news' && news.length > 0 && (
        <div className="card">
          <div className="panel-title" style={{ marginBottom: 8 }}>Recent News</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {news.slice(0, 8).map((item, i) => (
              <a
                key={i}
                href={item.link || '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '11px', color: 'var(--blue)',
                  textDecoration: 'none', padding: '5px 6px',
                  borderRadius: 'var(--r-md)',
                  transition: 'background var(--dur) var(--ease)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {item.title || 'News item'}
              </a>
            ))}
          </div>
        </div>
      )}

      {tab === 'news' && news.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)', fontSize: 11 }}>
          No recent news for {ticker}
        </div>
      )}

      {loading && !quote && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
          <span className="spinner" style={{ marginRight: '8px' }} /> Loading...
        </div>
      )}
    </div>
  )
}
