import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createChart, CrosshairMode, LineStyle,
  CandlestickSeries, HistogramSeries, LineSeries, AreaSeries,
} from 'lightweight-charts'
import { backendChart, backendPivots } from '../api/backend.js'

// ── Timeframes ────────────────────────────────────────────────────────────────
const INTERVALS = [
  { label: '1m',  days: 5,   interval: '1m',  refreshSec: 15  },
  { label: '5m',  days: 5,   interval: '5m',  refreshSec: 60  },
  { label: '15m', days: 10,  interval: '15m', refreshSec: 120 },
  { label: '30m', days: 20,  interval: '30m', refreshSec: 180 },
  { label: '1h',  days: 30,  interval: '1h',  refreshSec: 300 },
  { label: '4h',  days: 90,  interval: '4h',  refreshSec: 600 },
  { label: '1D',  days: 365, interval: '1d',  refreshSec: 0   },
]

// Symbols that serve delayed data from yfinance (indices, futures)
const DELAYED_SYMBOLS = new Set([
  '^GSPC', 'SPX', '^NDX', 'NDX', '^DJI', 'DJI', 'DJIA',
  '^RUT', 'RUT', '^VIX', 'VIX', '^IXIC', 'COMP',
])
const isDelayed = sym => DELAYED_SYMBOLS.has(sym?.toUpperCase())

const PIVOT_META = [
  { key: 'r3', label: 'R3', color: '#ef4444', style: LineStyle.Dashed },
  { key: 'r2', label: 'R2', color: '#f97316', style: LineStyle.Dashed },
  { key: 'r1', label: 'R1', color: '#fbbf24', style: LineStyle.Dashed },
  { key: 'pp', label: 'PP', color: '#3b82f6', style: LineStyle.Solid  },
  { key: 's1', label: 'S1', color: '#86efac', style: LineStyle.Dashed },
  { key: 's2', label: 'S2', color: '#22c55e', style: LineStyle.Dashed },
  { key: 's3', label: 'S3', color: '#16a34a', style: LineStyle.Dashed },
]

// ── Indicator math ────────────────────────────────────────────────────────────
function calcEMA(closes, period) {
  const k = 2 / (period + 1)
  const out = []
  let ema = null
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.push(null); continue }
    if (i === period - 1) {
      ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period
    } else {
      ema = closes[i] * k + ema * (1 - k)
    }
    out.push(ema)
  }
  return out
}

function calcSMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    return closes.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period
  })
}

function calcBollinger(closes, period = 20, mult = 2) {
  const mid = calcSMA(closes, period)
  const upper = [], lower = []
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] === null) { upper.push(null); lower.push(null); continue }
    const slice = closes.slice(i - period + 1, i + 1)
    const mean = mid[i]
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    upper.push(mean + mult * sd)
    lower.push(mean - mult * sd)
  }
  return { mid, upper, lower }
}

function calcRSI(closes, period = 14) {
  if (closes.length <= period) return closes.map(() => null)
  const rsi = new Array(period).fill(null)
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    d > 0 ? (avgGain += d) : (avgLoss += Math.abs(d))
  }
  avgGain /= period; avgLoss /= period
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss
  rsi.push(100 - 100 / (1 + rs0))
  for (let i = period + 1; i < closes.length; i++) {
    const d    = closes[i] - closes[i - 1]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi.push(100 - 100 / (1 + rs))
  }
  return rsi
}

// ── FVG detection (Fair Value Gap) ───────────────────────────────────────────
// A 3-candle gap: candle[i-1].high < candle[i+1].low (bullish)
//                 candle[i-1].low  > candle[i+1].high (bearish)
// Price tends to return to "fill" these gaps — key options entry zones.
function detectFVGs(highs, lows, times, lastClose, maxLookback = 120) {
  const fvgs = []
  const start = Math.max(0, highs.length - maxLookback)
  for (let i = start + 1; i < highs.length - 1; i++) {
    const bullish = lows[i + 1] > highs[i - 1]
    const bearish = highs[i + 1] < lows[i - 1]
    if (bullish) {
      const top = lows[i + 1], bottom = highs[i - 1]
      const filled = lastClose < bottom   // price fell through gap
      if (!filled) fvgs.push({ type: 'bullish', top, bottom, time: times[i], mid: (top + bottom) / 2 })
    } else if (bearish) {
      const top = lows[i - 1], bottom = highs[i + 1]
      const filled = lastClose > top      // price rose through gap
      if (!filled) fvgs.push({ type: 'bearish', top, bottom, time: times[i], mid: (top + bottom) / 2 })
    }
  }
  return fvgs.slice(-8)   // show 8 most recent unfilled
}

// ── Doji detection ────────────────────────────────────────────────────────────
// Doji = body < 10% of candle range → indecision / potential reversal
function detectDojis(opens, highs, lows, closes, times, lookback = 80) {
  const dojis = []
  const start = Math.max(0, closes.length - lookback)
  for (let i = start; i < closes.length; i++) {
    const body  = Math.abs(closes[i] - opens[i])
    const range = highs[i] - lows[i]
    if (!range || body / range > 0.10) continue
    const upper = highs[i] - Math.max(opens[i], closes[i])
    const lower = Math.min(opens[i], closes[i]) - lows[i]
    let type = 'Standard', signal = 'neutral', icon = '◈', optionsTip = ''
    if (lower > range * 0.60 && upper < range * 0.15) {
      type = 'Dragonfly'; signal = 'bullish'; icon = '🐉'
      optionsTip = 'Buyers rejected lower prices → bullish reversal → look for CALLS'
    } else if (upper > range * 0.60 && lower < range * 0.15) {
      type = 'Gravestone'; signal = 'bearish'; icon = '🪦'
      optionsTip = 'Sellers rejected higher prices → bearish reversal → look for PUTS'
    } else if (upper > range * 0.30 && lower > range * 0.30) {
      type = 'Long-leg'; signal = 'neutral'; icon = '✚'
      optionsTip = 'High indecision — premium is rich → wait for breakout or use straddle/strangle'
    } else {
      optionsTip = 'Indecision → confirm direction before entering — avoid buying premium'
    }
    dojis.push({ time: times[i], close: closes[i], high: highs[i], low: lows[i], type, signal, icon, optionsTip })
  }
  return dojis.slice(-6)
}

// ── FVG options implication ───────────────────────────────────────────────────
function fvgTip(fvg, currentPrice) {
  const inside = currentPrice >= fvg.bottom && currentPrice <= fvg.top
  if (fvg.type === 'bullish') {
    if (inside)               return '⚡ Price inside bullish FVG — support zone active → CALLS on hold above mid'
    if (currentPrice > fvg.top)   return '✅ Price above bullish FVG — gap is support → CALLS on pullback to gap'
    return '⚠️ Price below bullish FVG — gap may act as resistance → wait for reclaim before CALLS'
  } else {
    if (inside)               return '⚡ Price inside bearish FVG — resistance zone active → PUTS on rejection'
    if (currentPrice < fvg.bottom) return '✅ Price below bearish FVG — gap is resistance → PUTS on bounce to gap'
    return '⚠️ Price above bearish FVG — gap may act as support → wait for rejection before PUTS'
  }
}

// ── Indicator toggle button ───────────────────────────────────────────────────
function IndBtn({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: 'none',
      background: active ? (color + '33') : 'var(--bg-tertiary)',
      color: active ? color : 'var(--text-tertiary)',
      fontWeight: active ? 700 : 400,
      outline: active ? `1px solid ${color}` : '1px solid transparent',
    }}>
      {label}
    </button>
  )
}

// ── Main chart component ──────────────────────────────────────────────────────
export default function CandlestickChart({ symbol, height = 420 }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const seriesRef    = useRef({})
  const pivotLineRef = useRef([])
  const swingLineRef = useRef([])
  const prevDayRef   = useRef([])
  const fvgLineRef   = useRef([])   // price lines for FVG zones
  const rawDataRef   = useRef(null) // { ts, opens, highs, lows, closes } for FVG/Doji

  const [selIdx,   setSelIdx]   = useState(5)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [pivotData, setPivotData] = useState(null)
  const [pivotTf,  setPivotTf]  = useState('daily')
  const [pivotType, setPivotType] = useState('std') // std | fib

  const [ind, setInd] = useState({
    sma50: true, sma200: true,
    ema9: false, ema21: false,
    bb: false, rsi: false,
    pivots: false, swings: false, prevDay: true,
    fvg: false, doji: false,
  })
  const toggleInd = key => setInd(prev => ({ ...prev, [key]: !prev[key] }))

  const [refreshTick, setRefreshTick] = useState(0)
  const [countdown,   setCountdown]   = useState(0)

  // ── Auto-refresh: fire every refreshSec, count down each second ──────────
  useEffect(() => {
    const { refreshSec } = INTERVALS[selIdx]
    setCountdown(refreshSec)
    if (!refreshSec) return

    const tick = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          setRefreshTick(t => t + 1)
          return refreshSec
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [selIdx, refreshTick])

  const isDark = () => document.documentElement.getAttribute('data-theme') !== 'light'

  // ── Create chart + all series once ───────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const dark = isDark()

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: dark ? '#111318' : '#ffffff' },
        textColor:  dark ? '#a0a8b8' : '#555',
      },
      grid: {
        vertLines: { color: dark ? '#1a1f2e' : '#f0f0f0' },
        horzLines: { color: dark ? '#1a1f2e' : '#f0f0f0' },
      },
      crosshair:       { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: dark ? '#2a3040' : '#ddd' },
      timeScale: {
        borderColor:    dark ? '#2a3040' : '#ddd',
        timeVisible:    true,
        secondsVisible: false,
        // Format x-axis tick labels in Eastern time for intraday bars
        // TickMarkType: 0=Year 1=Month 2=DayOfMonth 3=Time 4=TimeWithSeconds
        tickMarkFormatter: (t, tickMarkType) => {
          if (typeof t === 'string') return null  // daily: let lightweight-charts handle it
          const d   = new Date(t * 1000)
          const ET  = 'America/New_York'
          if (tickMarkType >= 3) {
            // Time label — show HH:MM ET
            return d.toLocaleTimeString('en-US', { timeZone: ET, hour: '2-digit', minute: '2-digit', hour12: false })
          }
          if (tickMarkType === 2) {
            // Day label on intraday (e.g. when zoomed out to see multiple days)
            return d.toLocaleDateString('en-US', { timeZone: ET, month: 'short', day: 'numeric' })
          }
          if (tickMarkType === 1) {
            const m = d.toLocaleString('en-US', { timeZone: ET, month: 'short' })
            const y = d.toLocaleString('en-US', { timeZone: ET, year: '2-digit' })
            return `${m} '${y}`
          }
          return d.toLocaleDateString('en-US', { timeZone: ET, year: 'numeric' })
        },
      },
      localization: {
        // Crosshair tooltip time — also show in ET
        timeFormatter: (t) => {
          if (typeof t === 'string') return t
          const d = new Date(t * 1000)
          return d.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false,
          }) + ' ET'
        },
      },
      height,
    })

    // Main candle
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    })
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.04, bottom: 0.28 } })

    // Volume
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })

    // MAs (hidden by default except sma50 + sma200)
    const ema9  = chart.addSeries(LineSeries, { color: '#facc15', lineWidth: 1, title: 'EMA9',  visible: false, priceLineVisible: false, lastValueVisible: false })
    const ema21 = chart.addSeries(LineSeries, { color: '#fb923c', lineWidth: 1, title: 'EMA21', visible: false, priceLineVisible: false, lastValueVisible: false })
    const sma50 = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: 'SMA50', visible: true,  priceLineVisible: false, lastValueVisible: false })
    const sma200= chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2, title: 'SMA200',visible: true,  priceLineVisible: false, lastValueVisible: false })

    // Bollinger Bands
    const bbUpper = chart.addSeries(LineSeries, { color: '#64748b', lineWidth: 1, lineStyle: LineStyle.Dashed, visible: false, priceLineVisible: false, lastValueVisible: false })
    const bbMid   = chart.addSeries(LineSeries, { color: '#94a3b8', lineWidth: 1, visible: false, priceLineVisible: false, lastValueVisible: false })
    const bbLower = chart.addSeries(LineSeries, { color: '#64748b', lineWidth: 1, lineStyle: LineStyle.Dashed, visible: false, priceLineVisible: false, lastValueVisible: false })

    // RSI pane (separate scale at bottom)
    const rsi = chart.addSeries(LineSeries, {
      priceScaleId: 'rsi', color: '#c084fc', lineWidth: 1,
      visible: false, priceLineVisible: false, lastValueVisible: true,
    })
    chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false })
    rsi.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
    rsi.createPriceLine({ price: 30, color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
    rsi.createPriceLine({ price: 50, color: '#6b7280', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false })

    seriesRef.current = { candle, vol, ema9, ema21, sma50, sma200, bbUpper, bbMid, bbLower, rsi }
    chartRef.current  = chart

    const ro = new ResizeObserver(e => chart.applyOptions({ width: e[0].contentRect.width }))
    ro.observe(containerRef.current)

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null }
  }, [height])

  // ── Load OHLCV + compute indicators ──────────────────────────────────────
  useEffect(() => {
    const s = seriesRef.current
    if (!s.candle || !symbol) return
    const cfg = INTERVALS[selIdx]
    setLoading(true); setError(null)

    backendChart(symbol, cfg.days, cfg.interval)
      .then(data => {
        if (!data?.timestamps?.length) { setError('No data'); return }

        const ts     = data.timestamps
        const closes = data.close
        const opens  = data.open  || closes
        const highs  = data.high  || closes
        const lows   = data.low   || closes
        const vols   = data.volume || []

        // time field: date string for daily ('2024-11-14'), unix int for intraday
        const mkTime = t => typeof t === 'string' ? t : Math.floor(t)

        // Candles
        s.candle.setData(ts.map((t, i) => ({
          time:  mkTime(t),
          open:  opens[i] ?? closes[i],
          high:  highs[i] ?? closes[i],
          low:   lows[i]  ?? closes[i],
          close: closes[i],
        })).filter(c => c.close != null))

        // Store raw candle data for FVG / Doji detection
        rawDataRef.current = { ts, opens, highs, lows, closes }

        // Volume
        s.vol.setData(ts.map((t, i) => ({
          time:  mkTime(t),
          value: vols[i] || 0,
          color: closes[i] >= opens[i] ? '#22c55e33' : '#ef444433',
        })))

        // MAs — use mkTime for all indicator series too
        const toSeries2 = (timestamps, values) =>
          timestamps
            .map((t, i) => values[i] == null ? null : { time: mkTime(t), value: +values[i].toFixed(4) })
            .filter(Boolean)

        s.ema9.setData(toSeries2(ts,   calcEMA(closes, 9)))
        s.ema21.setData(toSeries2(ts,  calcEMA(closes, 21)))
        s.sma50.setData(toSeries2(ts,  calcSMA(closes, 50)))
        s.sma200.setData(toSeries2(ts, calcSMA(closes, 200)))

        // Bollinger
        const bb = calcBollinger(closes)
        s.bbUpper.setData(toSeries2(ts, bb.upper))
        s.bbMid.setData(toSeries2(ts,   bb.mid))
        s.bbLower.setData(toSeries2(ts, bb.lower))

        // RSI
        s.rsi.setData(toSeries2(ts, calcRSI(closes)))

        // For daily, fit all history. For intraday, default to ~1 session
        // so the x-axis shows time labels (HH:MM) rather than date labels.
        const intraDayWindow = {
          '1m': 120, '5m': 82, '15m': 56, '30m': 42, '1h': 36, '4h': 24,
        }
        const windowBars = intraDayWindow[cfg.interval]
        if (windowBars) {
          const total = ts.length
          chartRef.current?.timeScale().setVisibleLogicalRange({
            from: Math.max(0, total - windowBars) - 2,
            to: total + 2,
          })
        } else {
          chartRef.current?.timeScale().fitContent()
        }
      })
      .catch(err => { console.error('[Chart] load error:', err); setError('Failed to load chart') })
      .finally(() => setLoading(false))
  }, [symbol, selIdx, refreshTick])

  // ── Toggle indicator visibility ───────────────────────────────────────────
  useEffect(() => {
    const s = seriesRef.current
    if (!s.candle) return
    s.ema9.applyOptions({   visible: ind.ema9   })
    s.ema21.applyOptions({  visible: ind.ema21  })
    s.sma50.applyOptions({  visible: ind.sma50  })
    s.sma200.applyOptions({ visible: ind.sma200 })
    s.bbUpper.applyOptions({ visible: ind.bb })
    s.bbMid.applyOptions({   visible: ind.bb })
    s.bbLower.applyOptions({ visible: ind.bb })
    s.rsi.applyOptions({     visible: ind.rsi   })

    // Adjust price scale margins when RSI visible
    chartRef.current?.priceScale('right').applyOptions({
      scaleMargins: { top: 0.04, bottom: ind.rsi ? 0.30 : 0.12 },
    })
    chartRef.current?.priceScale('vol').applyOptions({
      scaleMargins: { top: ind.rsi ? 0.68 : 0.78, bottom: ind.rsi ? 0.22 : 0.02 },
    })
  }, [ind])

  // ── Fetch pivot data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!symbol) return
    backendPivots(symbol).then(setPivotData).catch(() => {})
  }, [symbol])

  // ── Draw pivot / swing / prev-day price lines ─────────────────────────────
  useEffect(() => {
    const s = seriesRef.current
    if (!s.candle) return

    // Clear existing lines
    ;[...pivotLineRef.current, ...swingLineRef.current, ...prevDayRef.current].forEach(l => {
      try { s.candle.removePriceLine(l) } catch {}
    })
    pivotLineRef.current = []
    swingLineRef.current = []
    prevDayRef.current   = []

    // Pivot levels
    if (ind.pivots && pivotData?.[pivotTf]) {
      const levels = pivotData[pivotTf]
      const src    = pivotType === 'fib' ? (levels.fib || levels) : levels
      PIVOT_META.forEach(({ key, label, color, style }) => {
        const price = src[key]
        if (!price) return
        try {
          const line = s.candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title: label })
          pivotLineRef.current.push(line)
        } catch {}
      })
    }

    // Swing highs / lows
    if (ind.swings && pivotData) {
      ;(pivotData.swingHighs || []).forEach(({ price }) => {
        try {
          const line = s.candle.createPriceLine({ price, color: '#f97316', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'SwH' })
          swingLineRef.current.push(line)
        } catch {}
      })
      ;(pivotData.swingLows || []).forEach(({ price }) => {
        try {
          const line = s.candle.createPriceLine({ price, color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'SwL' })
          swingLineRef.current.push(line)
        } catch {}
      })
    }

    // Previous day levels
    if (ind.prevDay && pivotData?.prevDay) {
      const pd = pivotData.prevDay
      const pdLevels = [
        { price: pd.high,  color: '#f87171', title: 'PDH' },
        { price: pd.low,   color: '#4ade80', title: 'PDL' },
        { price: pd.close, color: '#94a3b8', title: 'PDC' },
      ]
      pdLevels.forEach(({ price, color, title }) => {
        try {
          const line = s.candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title })
          prevDayRef.current.push(line)
        } catch {}
      })
    }
  }, [ind.pivots, ind.swings, ind.prevDay, pivotData, pivotTf, pivotType])

  // ── Draw FVG zones + Doji markers ────────────────────────────────────────
  useEffect(() => {
    const s = seriesRef.current
    if (!s.candle || !rawDataRef.current) return

    const { ts, opens, highs, lows, closes } = rawDataRef.current
    const mkTime = t => typeof t === 'string' ? t : Math.floor(t)
    const lastClose = closes[closes.length - 1]

    // Clear existing FVG lines
    fvgLineRef.current.forEach(l => { try { s.candle.removePriceLine(l) } catch {} })
    fvgLineRef.current = []

    // Draw FVG zones
    if (ind.fvg) {
      const fvgs = detectFVGs(highs, lows, ts, lastClose)
      fvgs.forEach(fvg => {
        const col = fvg.type === 'bullish' ? '#22c55e' : '#ef4444'
        try {
          fvgLineRef.current.push(s.candle.createPriceLine({
            price: fvg.top, color: col, lineWidth: 1, lineStyle: LineStyle.Dotted,
            axisLabelVisible: true, title: fvg.type === 'bullish' ? 'FVG↑' : 'FVG↓',
          }))
          fvgLineRef.current.push(s.candle.createPriceLine({
            price: fvg.bottom, color: col, lineWidth: 1, lineStyle: LineStyle.Dotted,
            axisLabelVisible: false, title: '',
          }))
          // midpoint line (dashed, lighter)
          fvgLineRef.current.push(s.candle.createPriceLine({
            price: fvg.mid, color: col + '66', lineWidth: 1, lineStyle: LineStyle.Dashed,
            axisLabelVisible: false, title: '',
          }))
        } catch {}
      })
    }

    // Draw Doji markers
    if (ind.doji && ts.length) {
      const dojis = detectDojis(opens, highs, lows, closes, ts)
      const markers = dojis.map(d => ({
        time:     mkTime(d.time),
        position: d.signal === 'bullish' ? 'belowBar' : 'aboveBar',
        color:    d.signal === 'bullish' ? '#22c55e' : d.signal === 'bearish' ? '#ef4444' : '#fbbf24',
        shape:    d.signal === 'bullish' ? 'arrowUp' : d.signal === 'bearish' ? 'arrowDown' : 'circle',
        text:     d.icon + ' ' + d.type,
        size:     1,
      }))
      try { s.candle.setMarkers(markers) } catch {}
    } else {
      try { s.candle.setMarkers([]) } catch {}
    }
  }, [ind.fvg, ind.doji, symbol, selIdx, refreshTick])

  return (
    <div>
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Timeframe */}
        <div style={{ display: 'flex', gap: 2 }}>
          {INTERVALS.map((iv, i) => (
            <button key={iv.label} onClick={() => setSelIdx(i)}
              className={`btn${i === selIdx ? ' btn-primary' : ''}`}
              style={{ fontSize: 10, padding: '2px 8px' }}>
              {iv.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 14, background: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Moving averages */}
        <IndBtn label="EMA9"   active={ind.ema9}   color="#facc15" onClick={() => toggleInd('ema9')}   />
        <IndBtn label="EMA21"  active={ind.ema21}  color="#fb923c" onClick={() => toggleInd('ema21')}  />
        <IndBtn label="SMA50"  active={ind.sma50}  color="#3b82f6" onClick={() => toggleInd('sma50')}  />
        <IndBtn label="SMA200" active={ind.sma200} color="#a855f7" onClick={() => toggleInd('sma200')} />
        <IndBtn label="BB"     active={ind.bb}     color="#94a3b8" onClick={() => toggleInd('bb')}     />
        <IndBtn label="RSI"    active={ind.rsi}    color="#c084fc" onClick={() => toggleInd('rsi')}    />

        <div style={{ width: 1, height: 14, background: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Levels */}
        <IndBtn label="PDH/PDL" active={ind.prevDay} color="#f87171" onClick={() => toggleInd('prevDay')} />
        <IndBtn label="Pivots"  active={ind.pivots}  color="#3b82f6" onClick={() => toggleInd('pivots')}  />
        <IndBtn label="Swings"  active={ind.swings}  color="#f97316" onClick={() => toggleInd('swings')}  />

        <div style={{ width: 1, height: 14, background: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Pattern recognition */}
        <IndBtn label="FVG"  active={ind.fvg}  color="#a855f7" onClick={() => toggleInd('fvg')}  />
        <IndBtn label="Doji" active={ind.doji} color="#fbbf24" onClick={() => toggleInd('doji')} />

        {/* Pivot sub-options */}
        {ind.pivots && (
          <>
            {['daily','weekly','monthly'].map(t => (
              <button key={t} onClick={() => setPivotTf(t)}
                className={`btn${pivotTf === t ? ' btn-primary' : ''}`}
                style={{ fontSize: 9, padding: '2px 6px' }}>
                {t.slice(0, 3).charAt(0).toUpperCase() + t.slice(1, 3)}
              </button>
            ))}
            <button onClick={() => setPivotType(p => p === 'std' ? 'fib' : 'std')}
              style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: pivotType === 'fib' ? 'var(--amber-dim)' : 'var(--bg-tertiary)',
                color: pivotType === 'fib' ? 'var(--amber-text)' : 'var(--text-tertiary)' }}>
              {pivotType === 'fib' ? 'Fib' : 'Std'}
            </button>
          </>
        )}

        {loading && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>Loading…</span>}
        {error   && <span style={{ fontSize: 10, color: 'var(--red-text)',       marginLeft: 4 }}>{error}</span>}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Delayed-data warning for indices */}
          {isDelayed(symbol) && (
            <span title="Index data from Yahoo Finance is typically 15 minutes delayed" style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: 'var(--amber-dim)', color: 'var(--amber-text)',
              fontWeight: 600, cursor: 'help',
            }}>
              ⚠ ~15 min delay
            </span>
          )}
          {/* Timezone badge — intraday only */}
          {selIdx < 5 && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              🕐 ET
            </span>
          )}
          {/* Auto-refresh countdown */}
          {INTERVALS[selIdx].refreshSec > 0 && (
            <span title="Auto-refresh countdown" style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)',
              background: countdown <= 10 ? 'var(--amber-dim)' : 'var(--bg-tertiary)',
              color:      countdown <= 10 ? 'var(--amber-text)' : 'var(--text-tertiary)',
            }}>
              🔄 {countdown}s
            </span>
          )}
        </div>
      </div>

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      <div ref={containerRef} style={{ width: '100%', height }} />

      {/* ── RSI label ──────────────────────────────────────────────────────── */}
      {ind.rsi && (
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: 'var(--text-tertiary)' }}>
          <span style={{ color: '#c084fc', fontWeight: 600 }}>RSI(14)</span>
          <span style={{ color: '#ef4444' }}>— 70 overbought</span>
          <span style={{ color: '#22c55e' }}>— 30 oversold</span>
        </div>
      )}

      {/* ── Level legend ───────────────────────────────────────────────────── */}
      {(ind.prevDay || ind.pivots || ind.swings) && pivotData && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 9, color: 'var(--text-tertiary)', padding: '6px 0' }}>
          {ind.prevDay && pivotData.prevDay && (
            <>
              <span style={{ color: '#f87171' }}>PDH ${pivotData.prevDay.high}</span>
              <span style={{ color: '#4ade80' }}>PDL ${pivotData.prevDay.low}</span>
              <span style={{ color: '#94a3b8' }}>PDC ${pivotData.prevDay.close}</span>
            </>
          )}
          {ind.pivots && pivotData[pivotTf] && (() => {
            const src = pivotType === 'fib' ? (pivotData[pivotTf].fib || pivotData[pivotTf]) : pivotData[pivotTf]
            return PIVOT_META.map(({ key, label, color }) =>
              src[key] ? <span key={key} style={{ color }}>{label} ${src[key]}</span> : null
            )
          })()}
          {ind.swings && (
            <>
              {(pivotData.swingHighs || []).map((h, i) => <span key={`sh${i}`} style={{ color: '#f97316' }}>SwH ${h.price}</span>)}
              {(pivotData.swingLows  || []).map((l, i) => <span key={`sl${i}`} style={{ color: '#22c55e' }}>SwL ${l.price}</span>)}
            </>
          )}
          {ind.pivots && pivotData[pivotTf]?.date && (
            <span style={{ color: 'var(--text-tertiary)' }}>({pivotTf}, from {pivotData[pivotTf].date})</span>
          )}
        </div>
      )}

      {/* ── FVG + Doji signals panel ───────────────────────────────────────── */}
      {(ind.fvg || ind.doji) && rawDataRef.current && (() => {
        const { ts, opens, highs, lows, closes } = rawDataRef.current
        const lastClose = closes[closes.length - 1]
        const fvgs  = ind.fvg  ? detectFVGs(highs, lows, ts, lastClose) : []
        const dojis = ind.doji ? detectDojis(opens, highs, lows, closes, ts) : []
        if (!fvgs.length && !dojis.length) return null

        return (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* FVG signals */}
            {fvgs.length > 0 && (
              <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6,
                borderLeft: '3px solid #a855f7' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 6 }}>
                  ◈ Fair Value Gaps ({fvgs.length} unfilled)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {fvgs.map((fvg, i) => {
                    const col = fvg.type === 'bullish' ? 'var(--green-text)' : 'var(--red-text)'
                    const tip = fvgTip(fvg, lastClose)
                    return (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: col, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap' }}>
                          {fvg.type === 'bullish' ? '▲' : '▼'} ${fvg.bottom.toFixed(2)}–${fvg.top.toFixed(2)}
                          <span style={{ fontSize: 8, marginLeft: 4, opacity: 0.7 }}>mid ${fvg.mid.toFixed(2)}</span>
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{tip}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Doji signals */}
            {dojis.length > 0 && (
              <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6,
                borderLeft: '3px solid #fbbf24' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 6 }}>
                  ◈ Recent Doji Candles ({dojis.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[...dojis].reverse().map((d, i) => {
                    const col = d.signal === 'bullish' ? 'var(--green-text)'
                              : d.signal === 'bearish' ? 'var(--red-text)' : 'var(--amber-text)'
                    return (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: col, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {d.icon} {d.type} Doji @ ${d.close.toFixed(2)}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{d.optionsTip}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Indicator legend ───────────────────────────────────────────────── */}
      <div style={{
        marginTop: 8, padding: '8px 10px',
        background: 'var(--bg-secondary)', borderRadius: 6,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '4px 16px',
      }}>
        {[
          { abbr: 'EMA 9 / 21', color: '#facc15', desc: 'Exponential Moving Average — reacts faster to recent price changes' },
          { abbr: 'SMA 50 / 200', color: '#3b82f6', desc: 'Simple Moving Average — equal weight to all periods; 200 = long-term trend' },
          { abbr: 'BB', color: '#94a3b8', desc: 'Bollinger Bands — 20-period SMA ± 2 std deviations; wide = high volatility' },
          { abbr: 'RSI', color: '#c084fc', desc: 'Relative Strength Index (14) — >70 overbought, <30 oversold' },
          { abbr: 'PP', color: '#3b82f6', desc: 'Pivot Point — (Prev High + Low + Close) ÷ 3; intraday magnet level' },
          { abbr: 'R1 / R2 / R3', color: '#f97316', desc: 'Resistance levels above PP — price may stall or reverse going up' },
          { abbr: 'S1 / S2 / S3', color: '#22c55e', desc: 'Support levels below PP — price may find buyers going down' },
          { abbr: 'PDH / PDL', color: '#f87171', desc: 'Previous Day High / Low — key intraday reference; breakouts watched closely' },
          { abbr: 'PDC', color: '#94a3b8', desc: 'Previous Day Close — gap-up/gap-down reference for morning traders' },
          { abbr: 'SwH / SwL', color: '#f97316', desc: 'Swing High / Low — recent price-action extremes; act as S/R zones' },
          { abbr: 'FVG ▲▼',   color: '#a855f7', desc: 'Fair Value Gap — 3-candle price gap; unfilled gaps act as support/resistance; price tends to return to fill them → options entry zone' },
          { abbr: 'Doji 🐉🪦', color: '#fbbf24', desc: 'Doji candle — open ≈ close (tiny body = indecision). Dragonfly 🐉 = bullish reversal (CALLS). Gravestone 🪦 = bearish reversal (PUTS). Long-leg ✚ = straddle' },
        ].map(({ abbr, color, desc }) => (
          <div key={abbr} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color, whiteSpace: 'nowrap', minWidth: 64 }}>{abbr}</span>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
