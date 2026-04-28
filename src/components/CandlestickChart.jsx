import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { backendChart } from '../api/backend.js'

const INTERVALS = [
  { label: '5m',  days: 1,  interval: '5m'  },
  { label: '15m', days: 3,  interval: '15m' },
  { label: '1h',  days: 7,  interval: '1h'  },
  { label: '4h',  days: 30, interval: '1d'  },
  { label: '1D',  days: 90, interval: '1d'  },
  { label: '1W',  days: 365,interval: '1wk' },
]

export default function CandlestickChart({ symbol, height = 320 }) {
  const containerRef  = useRef(null)
  const chartRef      = useRef(null)
  const candleRef     = useRef(null)
  const volRef        = useRef(null)
  const [selIdx,  setSelIdx]  = useState(4)   // default 1D
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light'

    const chart = createChart(containerRef.current, {
      layout: {
        background:  { color: isDark ? '#111318' : '#ffffff' },
        textColor:   isDark ? '#a0a8b8' : '#444',
      },
      grid: {
        vertLines:   { color: isDark ? '#1e2430' : '#f0f0f0' },
        horzLines:   { color: isDark ? '#1e2430' : '#f0f0f0' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: isDark ? '#2a3040' : '#ddd' },
      timeScale:       { borderColor: isDark ? '#2a3040' : '#ddd', timeVisible: true, secondsVisible: false },
      height,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor:   '#22c55e',
      downColor: '#ef4444',
      borderUpColor:   '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor:   '#22c55e',
      wickDownColor: '#ef4444',
    })

    const volSeries = chart.addHistogramSeries({
      priceFormat:     { type: 'volume' },
      priceScaleId:    'vol',
      scaleMargins:    { top: 0.8, bottom: 0 },
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

    chartRef.current  = chart
    candleRef.current = candleSeries
    volRef.current    = volSeries

    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect
      chart.applyOptions({ width })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [height])

  // Load data whenever symbol or interval changes
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

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {INTERVALS.map((iv, i) => (
          <button
            key={iv.label}
            onClick={() => setSelIdx(i)}
            className={`btn${i === selIdx ? ' btn-primary' : ''}`}
            style={{ fontSize: 10, padding: '2px 8px' }}
          >
            {iv.label}
          </button>
        ))}
        {loading && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>Loading...</span>}
        {error   && <span style={{ fontSize: 10, color: 'var(--red-text)',       marginLeft: 4 }}>{error}</span>}
      </div>
      <div ref={containerRef} style={{ width: '100%', height }} />
    </div>
  )
}
