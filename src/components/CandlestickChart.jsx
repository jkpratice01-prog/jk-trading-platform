import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode, LineStyle, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import { backendChart, backendPivots } from '../api/backend.js'

// Each entry: what the user clicked, how many days to show, what interval to fetch
// `days` is passed to the backend — it now respects this value instead of ignoring it
const INTERVALS = [
  { label: '5m',  days: 5,   interval: '5m'  },  // 5 days of 5-min bars (~390 bars)
  { label: '15m', days: 10,  interval: '15m' },  // 10 days of 15-min bars
  { label: '30m', days: 20,  interval: '30m' },  // 20 days of 30-min bars
  { label: '1h',  days: 30,  interval: '1h'  },  // 30 days of hourly bars
  { label: '4h',  days: 90,  interval: '4h'  },  // 90 days → resampled to 4h on backend
  { label: '1D',  days: 365, interval: '1d'  },  // 1 year of daily bars
]

const PIVOT_LINES = [
  { key: 'r3', label: 'R3', color: '#ef4444', style: LineStyle.Dashed },
  { key: 'r2', label: 'R2', color: '#f97316', style: LineStyle.Dashed },
  { key: 'r1', label: 'R1', color: '#fbbf24', style: LineStyle.Dashed },
  { key: 'pp', label: 'PP', color: '#3b82f6', style: LineStyle.Solid  },
  { key: 's1', label: 'S1', color: '#86efac', style: LineStyle.Dashed },
  { key: 's2', label: 'S2', color: '#22c55e', style: LineStyle.Dashed },
  { key: 's3', label: 'S3', color: '#16a34a', style: LineStyle.Dashed },
]

export default function CandlestickChart({ symbol, height = 320 }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const candleRef    = useRef(null)
  const volRef       = useRef(null)
  const pivotRefs    = useRef([])

  const [selIdx,     setSelIdx]     = useState(5)   // default: 1D
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [showPivots, setShowPivots] = useState(false)
  const [pivotTf,    setPivotTf]    = useState('daily')
  const [pivotData,  setPivotData]  = useState(null)

  // Create chart once using v5 API
  useEffect(() => {
    if (!containerRef.current) return
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light'

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: isDark ? '#111318' : '#ffffff' },
        textColor:  isDark ? '#a0a8b8' : '#444',
      },
      grid: {
        vertLines: { color: isDark ? '#1e2430' : '#f0f0f0' },
        horzLines: { color: isDark ? '#1e2430' : '#f0f0f0' },
      },
      crosshair:       { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: isDark ? '#2a3040' : '#ddd' },
      timeScale:       { borderColor: isDark ? '#2a3040' : '#ddd', timeVisible: true, secondsVisible: false },
      height,
    })

    // v5 API: chart.addSeries(SeriesType, options)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:        '#22c55e', downColor:        '#ef4444',
      borderUpColor:  '#22c55e', borderDownColor:  '#ef4444',
      wickUpColor:    '#22c55e', wickDownColor:    '#ef4444',
    })

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

    chartRef.current  = chart
    candleRef.current = candleSeries
    volRef.current    = volSeries

    const ro = new ResizeObserver(entries => {
      chart.applyOptions({ width: entries[0].contentRect.width })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current  = null
      candleRef.current = null
    }
  }, [height])

  // Load OHLCV data
  useEffect(() => {
    if (!candleRef.current || !symbol) return
    const cfg = INTERVALS[selIdx]
    setLoading(true)
    setError(null)

    backendChart(symbol, cfg.days, cfg.interval)
      .then(data => {
        if (!data?.timestamps?.length) { setError('No data'); return }
        const candles = data.timestamps.map((t, i) => ({
          time:  Math.floor(t),
          open:  data.open?.[i]  ?? data.close[i],
          high:  data.high?.[i]  ?? data.close[i],
          low:   data.low?.[i]   ?? data.close[i],
          close: data.close[i],
        })).filter(c => c.close != null)

        const vols = data.timestamps.map((t, i) => ({
          time:  Math.floor(t),
          value: data.volume?.[i] || 0,
          color: (data.close[i] >= (data.open?.[i] ?? data.close[i])) ? '#22c55e44' : '#ef444444',
        }))

        candleRef.current.setData(candles)
        volRef.current.setData(vols)
        chartRef.current?.timeScale().fitContent()
      })
      .catch(() => setError('Failed to load chart'))
      .finally(() => setLoading(false))
  }, [symbol, selIdx])

  // Fetch pivot data
  useEffect(() => {
    if (!symbol) return
    backendPivots(symbol).then(setPivotData).catch(() => {})
  }, [symbol])

  // Draw / remove pivot lines
  useEffect(() => {
    if (!candleRef.current) return
    pivotRefs.current.forEach(line => { try { candleRef.current.removePriceLine(line) } catch {} })
    pivotRefs.current = []
    if (!showPivots || !pivotData?.[pivotTf]) return
    const levels = pivotData[pivotTf]
    PIVOT_LINES.forEach(({ key, label, color, style }) => {
      const price = levels[key]
      if (!price) return
      try {
        const line = candleRef.current.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title: label })
        pivotRefs.current.push(line)
      } catch {}
    })
  }, [showPivots, pivotTf, pivotData])

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {INTERVALS.map((iv, i) => (
          <button key={iv.label} onClick={() => setSelIdx(i)}
            className={`btn${i === selIdx ? ' btn-primary' : ''}`}
            style={{ fontSize: 10, padding: '2px 8px' }}>
            {iv.label}
          </button>
        ))}
        <div style={{ width: 1, height: 14, background: 'var(--border-subtle)', margin: '0 2px' }} />
        <button onClick={() => setShowPivots(v => !v)}
          className={`btn${showPivots ? ' btn-primary' : ''}`}
          style={{ fontSize: 10, padding: '2px 8px' }}>
          Pivots
        </button>
        {showPivots && pivotData && ['daily','weekly','monthly'].map(t => (
          <button key={t} onClick={() => setPivotTf(t)}
            className={`btn${pivotTf === t ? ' btn-primary' : ''}`}
            style={{ fontSize: 9, padding: '2px 6px', textTransform: 'capitalize' }}>
            {t.charAt(0).toUpperCase() + t.slice(1, 3)}
          </button>
        ))}
        {loading && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>Loading…</span>}
        {error   && <span style={{ fontSize: 10, color: 'var(--red-text)',       marginLeft: 4 }}>{error}</span>}
      </div>

      <div ref={containerRef} style={{ width: '100%', height }} />

      {showPivots && pivotData?.[pivotTf] && (
        <>
          {/* Price labels */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            {PIVOT_LINES.map(({ key, label, color }) => {
              const val = pivotData[pivotTf][key]
              return val ? (
                <span key={key} style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color }}>
                  {label} ${val}
                </span>
              ) : null
            })}
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
              ({pivotTf}, from {pivotData[pivotTf]?.date})
            </span>
          </div>
          {/* Legend description */}
          <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>R3/R2/R1</span> — Resistance levels (price may stall or reverse here going up) &nbsp;·&nbsp;
            <span style={{ color: '#3b82f6', fontWeight: 600 }}>PP</span> — Pivot Point (calculated from prior session High+Low+Close ÷ 3; acts as intraday magnet) &nbsp;·&nbsp;
            <span style={{ color: '#22c55e', fontWeight: 600 }}>S1/S2/S3</span> — Support levels (price may find buyers here going down)
          </div>
        </>
      )}
    </div>
  )
}
