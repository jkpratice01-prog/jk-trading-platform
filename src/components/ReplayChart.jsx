/**
 * Chart Replay Mode — load historical OHLCV data and step through it bar-by-bar.
 * Trains pattern recognition without knowing what comes next.
 * Includes paper-trade tracking: buy/sell at the current replay bar and track P&L.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  createChart, CrosshairMode, LineStyle,
  CandlestickSeries, HistogramSeries, LineSeries,
} from 'lightweight-charts'
import { backendChart } from '../api/backend.js'

const TIMEFRAMES = [
  { label: '1m',  interval: '1m',  days: 5   },
  { label: '5m',  interval: '5m',  days: 10  },
  { label: '15m', interval: '15m', days: 20  },
  { label: '30m', interval: '30m', days: 30  },
  { label: '1h',  interval: '1h',  days: 60  },
  { label: '4h',  interval: '4h',  days: 120 },
  { label: '1D',  interval: '1d',  days: 365 },
]

const SPEEDS = [
  { label: '1s/bar',  ms: 1000 },
  { label: '0.5s',    ms: 500  },
  { label: '0.25s',   ms: 250  },
  { label: '0.1s',    ms: 100  },
  { label: '2s/bar',  ms: 2000 },
  { label: '5s/bar',  ms: 5000 },
]

function calcEMA(closes, period) {
  const k = 2 / (period + 1)
  let ema = null
  return closes.map((v, i) => {
    if (i < period - 1) return null
    if (i === period - 1) ema = closes.slice(0, period).reduce((s, x) => s + x, 0) / period
    else ema = v * k + ema * (1 - k)
    return ema
  })
}

function calcVWAP(highs, lows, closes, volumes, timestamps) {
  let cumTypVol = 0, cumVol = 0, prevDay = null
  return closes.map((c, i) => {
    const t = timestamps[i]
    const day = typeof t === 'string' ? t : new Date(t * 1000).toDateString()
    if (day !== prevDay) { cumTypVol = 0; cumVol = 0; prevDay = day }
    const vol = volumes[i] || 0
    cumTypVol += ((highs[i] + lows[i] + c) / 3) * vol
    cumVol    += vol
    return cumVol > 0 ? cumTypVol / cumVol : c
  })
}

function fmt(n, dec = 2) { return n == null ? '—' : Number(n).toFixed(dec) }
function fmtPct(n) { if (n == null) return '—'; const s = n >= 0 ? '+' : ''; return s + n.toFixed(2) + '%' }
function fmtVol(n) {
  if (!n) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}

const START_BARS = 80   // start replay with this many bars visible

export default function ReplayChart() {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const seriesRef    = useRef({})
  const playRef      = useRef(null)

  // Data
  const [allData,  setAllData]  = useState(null)   // { timestamps, open, high, low, close, volume }
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  // Controls
  const [sym,        setSym]        = useState('SPY')
  const [tfIdx,      setTfIdx]      = useState(3)        // 30m default
  const [speedIdx,   setSpeedIdx]   = useState(0)        // 1s/bar default
  const [playing,    setPlaying]    = useState(false)
  const [replayIdx,  setReplayIdx]  = useState(START_BARS)
  const [showVWAP,   setShowVWAP]   = useState(false)
  const [showEMA,    setShowEMA]    = useState(false)
  const [useDateRange, setUseDateRange] = useState(false)
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')

  // Paper trades
  const [trades,    setTrades]    = useState([])
  const [openTrade, setOpenTrade] = useState(null)   // { side, entryPrice, entryBar }
  const [qty,       setQty]       = useState('100')

  const total = allData?.timestamps?.length || 0

  // ── Chart init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const dark = document.documentElement.getAttribute('data-theme') !== 'light'

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
      rightPriceScale: { borderColor: dark ? '#2a3040' : '#ddd', scaleMargins: { top: 0.04, bottom: 0.14 } },
      timeScale: {
        borderColor: dark ? '#2a3040' : '#ddd',
        timeVisible: true, secondsVisible: false,
      },
      height: 400,
    })

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    })
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    const ema9  = chart.addSeries(LineSeries, { color: '#facc15', lineWidth: 1, visible: false, priceLineVisible: false, lastValueVisible: false })
    const ema21 = chart.addSeries(LineSeries, { color: '#fb923c', lineWidth: 1, visible: false, priceLineVisible: false, lastValueVisible: false })
    const vwap  = chart.addSeries(LineSeries, {
      color: '#22d3ee', lineWidth: 2, lineStyle: LineStyle.Dashed,
      title: 'VWAP', visible: false, priceLineVisible: false, lastValueVisible: true,
    })

    const ro = new ResizeObserver(e => chart.applyOptions({ width: e[0].contentRect.width }))
    ro.observe(containerRef.current)

    seriesRef.current = { candle, vol, ema9, ema21, vwap }
    chartRef.current  = chart

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null }
  }, [])

  // ── Load data ─────────────────────────────────────────────────────────────
  async function load() {
    const tf = TIMEFRAMES[tfIdx]
    if (useDateRange && (!startDate || !endDate)) {
      setError('Enter both start and end dates'); return
    }
    setLoading(true); setError(null); setPlaying(false); setOpenTrade(null); setTrades([])
    clearInterval(playRef.current)
    try {
      const d = useDateRange
        ? await backendChart(sym.trim().toUpperCase(), tf.days, tf.interval, startDate, endDate)
        : await backendChart(sym.trim().toUpperCase(), tf.days, tf.interval)
      if (!d?.timestamps?.length) { setError('No data returned for this range'); return }
      setAllData(d)
      setReplayIdx(Math.min(START_BARS, d.timestamps.length))
    } catch (e) {
      setError('Failed to load — ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Render slice of data to chart ─────────────────────────────────────────
  useEffect(() => {
    const s = seriesRef.current
    if (!s.candle || !allData || replayIdx < 1) return

    const slice = n => allData[n]?.slice(0, replayIdx) ?? []
    const ts     = slice('timestamps')
    const closes = slice('close')
    const opens  = slice('open')
    const highs  = slice('high')
    const lows   = slice('low')
    const vols   = slice('volume')

    const mkTime = t => typeof t === 'string' ? t : Math.floor(t)

    s.candle.setData(ts.map((t, i) => ({
      time: mkTime(t), open: opens[i] ?? closes[i],
      high: highs[i] ?? closes[i], low: lows[i] ?? closes[i], close: closes[i],
    })).filter(c => c.close != null))

    s.vol.setData(ts.map((t, i) => ({
      time: mkTime(t), value: vols[i] || 0,
      color: closes[i] >= opens[i] ? '#22c55e33' : '#ef444433',
    })))

    const toS = (timestamps, vals) =>
      timestamps.map((t, i) => vals[i] == null ? null : { time: mkTime(t), value: vals[i] }).filter(Boolean)

    s.ema9.setData(toS(ts, calcEMA(closes, 9)))
    s.ema21.setData(toS(ts, calcEMA(closes, 21)))
    s.vwap.setData(toS(ts, calcVWAP(highs, lows, closes, vols, ts)))

    // Show last N bars in view
    const view = 80
    const total = ts.length
    chartRef.current?.timeScale().setVisibleLogicalRange({
      from: Math.max(0, total - view) - 1,
      to: total + 3,
    })
  }, [allData, replayIdx])

  // ── Indicator visibility ──────────────────────────────────────────────────
  useEffect(() => {
    const s = seriesRef.current
    if (!s.ema9) return
    s.ema9.applyOptions({ visible: showEMA })
    s.ema21.applyOptions({ visible: showEMA })
    s.vwap.applyOptions({ visible: showVWAP })
  }, [showEMA, showVWAP])

  // ── Autoplay ──────────────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(playRef.current)
    if (!playing || !allData) return
    const ms = SPEEDS[speedIdx].ms
    playRef.current = setInterval(() => {
      setReplayIdx(idx => {
        if (idx >= allData.timestamps.length) {
          setPlaying(false)
          return idx
        }
        return idx + 1
      })
    }, ms)
    return () => clearInterval(playRef.current)
  }, [playing, speedIdx, allData])

  // ── Paper trade helpers ───────────────────────────────────────────────────
  const currentBar = allData && replayIdx > 0 ? {
    close: allData.close[replayIdx - 1],
    open:  allData.open[replayIdx - 1],
    high:  allData.high[replayIdx - 1],
    low:   allData.low[replayIdx - 1],
    vol:   allData.volume[replayIdx - 1],
    time:  allData.timestamps[replayIdx - 1],
  } : null

  function enterTrade(side) {
    if (!currentBar || openTrade) return
    setOpenTrade({ side, entryPrice: currentBar.close, entryBar: replayIdx, qty: parseInt(qty) || 100 })
  }

  function exitTrade() {
    if (!currentBar || !openTrade) return
    const { side, entryPrice, qty: q } = openTrade
    const exitPrice = currentBar.close
    const pnl = side === 'long'
      ? (exitPrice - entryPrice) * q
      : (entryPrice - exitPrice) * q
    const pnlPct = side === 'long'
      ? (exitPrice - entryPrice) / entryPrice * 100
      : (entryPrice - exitPrice) / entryPrice * 100
    setTrades(t => [{ ...openTrade, exitPrice, exitBar: replayIdx, pnl, pnlPct }, ...t])
    setOpenTrade(null)
  }

  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0)
  const winRate  = trades.length ? Math.round(trades.filter(t => t.pnl > 0).length / trades.length * 100) : 0
  const unrealizedPnL = openTrade && currentBar
    ? openTrade.side === 'long'
      ? (currentBar.close - openTrade.entryPrice) * openTrade.qty
      : (openTrade.entryPrice - currentBar.close) * openTrade.qty
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Controls */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">📽 Chart Replay</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Step through history bar by bar — train without seeing the future
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <input
            value={sym}
            onChange={e => setSym(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Symbol"
            style={{ width: 80, fontSize: 12, padding: '5px 8px', fontFamily: 'var(--font-mono)' }}
          />

          <div style={{ display: 'flex', gap: 2 }}>
            {TIMEFRAMES.map((tf, i) => (
              <button
                key={tf.label}
                onClick={() => setTfIdx(i)}
                className={`btn${i === tfIdx ? ' btn-primary' : ''}`}
                style={{ fontSize: 10, padding: '3px 7px' }}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Date range toggle */}
          <button
            onClick={() => setUseDateRange(v => !v)}
            style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: useDateRange ? 'rgba(129,140,248,0.18)' : 'var(--bg-tertiary)',
              color: useDateRange ? '#818cf8' : 'var(--text-tertiary)',
              outline: useDateRange ? '1px solid #818cf8' : '1px solid transparent',
            }}
          >
            📅 Date range
          </button>

          {useDateRange && (
            <>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ fontSize: 11, padding: '4px 6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>→</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{ fontSize: 11, padding: '4px 6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}
              />
            </>
          )}

          <button className="btn btn-primary" onClick={load} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? 'Loading…' : '⬇ Load'}
          </button>
        </div>

        {allData && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Playback controls */}
            <button
              className="btn"
              onClick={() => setReplayIdx(i => Math.max(START_BARS, i - 1))}
              disabled={replayIdx <= START_BARS}
              title="Step back one bar"
              style={{ fontSize: 14, padding: '3px 10px' }}
            >◀</button>

            <button
              className="btn btn-primary"
              onClick={() => setPlaying(p => !p)}
              style={{ fontSize: 13, padding: '4px 14px', minWidth: 80 }}
            >
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>

            <button
              className="btn"
              onClick={() => setReplayIdx(i => Math.min(total, i + 1))}
              disabled={replayIdx >= total}
              title="Step forward one bar"
              style={{ fontSize: 14, padding: '3px 10px' }}
            >▶</button>

            <button
              className="btn"
              onClick={() => setReplayIdx(i => Math.min(total, i + 10))}
              disabled={replayIdx >= total}
              title="Jump forward 10 bars"
              style={{ fontSize: 11, padding: '3px 8px' }}
            >+10</button>

            {/* Speed */}
            <select
              value={speedIdx}
              onChange={e => setSpeedIdx(Number(e.target.value))}
              style={{ fontSize: 11, padding: '4px 6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}
            >
              {SPEEDS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
            </select>

            {/* Scrubber */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 160 }}>
              <input
                type="range"
                min={START_BARS}
                max={total}
                value={replayIdx}
                onChange={e => { setPlaying(false); setReplayIdx(Number(e.target.value)) }}
                style={{ flex: 1, accentColor: 'var(--blue)' }}
              />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {replayIdx} / {total}
              </span>
            </div>

            {/* Overlay toggles */}
            <button
              onClick={() => setShowVWAP(v => !v)}
              style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: showVWAP ? '#22d3ee22' : 'var(--bg-tertiary)',
                color: showVWAP ? '#22d3ee' : 'var(--text-tertiary)',
                outline: showVWAP ? '1px solid #22d3ee' : '1px solid transparent',
              }}
            >VWAP</button>
            <button
              onClick={() => setShowEMA(v => !v)}
              style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: showEMA ? '#facc1522' : 'var(--bg-tertiary)',
                color: showEMA ? '#facc15' : 'var(--text-tertiary)',
                outline: showEMA ? '1px solid #facc15' : '1px solid transparent',
              }}
            >EMA 9/21</button>

            {replayIdx >= total && (
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'var(--amber-dim)', color: 'var(--amber-text)', fontWeight: 600 }}>
                End of data
              </span>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 6 }}>
            {error}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="card" style={{ padding: 8 }}>
        <div ref={containerRef} style={{ width: '100%', height: 400 }} />

        {/* Current bar stats */}
        {currentBar && (
          <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            {[
              { label: 'O', value: fmt(currentBar.open),  color: 'var(--text-secondary)' },
              { label: 'H', value: fmt(currentBar.high),  color: 'var(--green-text)'     },
              { label: 'L', value: fmt(currentBar.low),   color: 'var(--red-text)'       },
              { label: 'C', value: fmt(currentBar.close), color: currentBar.close >= currentBar.open ? 'var(--green-text)' : 'var(--red-text)' },
              { label: 'Vol', value: fmtVol(currentBar.vol), color: 'var(--text-secondary)' },
            ].map(({ label, value, color }) => (
              <span key={label}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>{label} </span>
                <span style={{ color, fontWeight: 600 }}>{value}</span>
              </span>
            ))}
            {!allData ? null : (
              <span style={{ color: 'var(--text-tertiary)', fontSize: 9, marginLeft: 4 }}>
                Bar {replayIdx}/{total} · {TIMEFRAMES[tfIdx].label}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Paper trading panel */}
      {allData && (
        <div className="card">
          <div className="panel-hd" style={{ marginBottom: 12 }}>
            <span className="panel-title">📝 Paper Trades</span>
            {trades.length > 0 && (
              <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                <span style={{ color: totalPnL >= 0 ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 700 }}>
                  Total P&L: {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>Win rate: {winRate}%</span>
              </div>
            )}
          </div>

          {/* Open trade status */}
          {openTrade ? (
            <div style={{
              marginBottom: 12, padding: '10px 14px', borderRadius: 8,
              background: openTrade.side === 'long' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `0.5px solid ${openTrade.side === 'long' ? 'var(--green-text)' : 'var(--red-text)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{
                    fontWeight: 700, fontSize: 12,
                    color: openTrade.side === 'long' ? 'var(--green-text)' : 'var(--red-text)',
                  }}>
                    {openTrade.side === 'long' ? '▲ LONG' : '▼ SHORT'} {openTrade.qty} shares @ ${fmt(openTrade.entryPrice)}
                  </span>
                  {unrealizedPnL != null && (
                    <span style={{
                      marginLeft: 12, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600,
                      color: unrealizedPnL >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                    }}>
                      Unrealized: {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)} ({fmtPct(
                        (openTrade.side === 'long'
                          ? (currentBar.close - openTrade.entryPrice) / openTrade.entryPrice
                          : (openTrade.entryPrice - currentBar.close) / openTrade.entryPrice) * 100
                      )})
                    </span>
                  )}
                </div>
                <button
                  className="btn"
                  onClick={exitTrade}
                  style={{ fontSize: 11, padding: '4px 14px', borderColor: 'var(--border-default)' }}
                >
                  Exit @ ${fmt(currentBar?.close)}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Qty:</span>
              <input
                type="number"
                value={qty}
                onChange={e => setQty(e.target.value)}
                style={{ width: 70, fontSize: 11, padding: '4px 8px' }}
              />
              <button
                className="btn"
                onClick={() => enterTrade('long')}
                disabled={!currentBar}
                style={{ fontSize: 11, padding: '4px 14px', color: 'var(--green-text)', border: '0.5px solid var(--green-text)' }}
              >
                ▲ Buy Long @ ${fmt(currentBar?.close)}
              </button>
              <button
                className="btn"
                onClick={() => enterTrade('short')}
                disabled={!currentBar}
                style={{ fontSize: 11, padding: '4px 14px', color: 'var(--red-text)', border: '0.5px solid var(--red-text)' }}
              >
                ▼ Sell Short @ ${fmt(currentBar?.close)}
              </button>
            </div>
          )}

          {/* Trade history */}
          {trades.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Qty</th>
                    <th>P&L</th>
                    <th>%</th>
                    <th>Bars</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={i}>
                      <td>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: t.side === 'long' ? 'var(--green-text)' : 'var(--red-text)',
                        }}>
                          {t.side === 'long' ? '▲ LONG' : '▼ SHORT'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>${fmt(t.entryPrice)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>${fmt(t.exitPrice)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{t.qty}</td>
                      <td style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                        color: t.pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                      }}>
                        {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                      </td>
                      <td style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: t.pnlPct >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                      }}>
                        {fmtPct(t.pnlPct)}
                      </td>
                      <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {t.exitBar - t.entryBar}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '8px 0' }}>
              No trades yet — use the buttons above to enter a position at the current bar.
              Step forward to see price move, then exit to record your P&L.
            </div>
          )}
        </div>
      )}

      {!allData && !loading && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📽</div>
          <div style={{ fontSize: 14, marginBottom: 6, color: 'var(--text-primary)', fontWeight: 600 }}>Chart Replay Mode</div>
          <div style={{ fontSize: 11, maxWidth: 420, margin: '0 auto', lineHeight: 1.7 }}>
            Enter a symbol and timeframe above, then click <strong>Load</strong> to fetch historical data.
            Step through bars one at a time or hit <strong>Play</strong> to auto-advance.
            Practice reading charts without seeing what comes next — the fastest way to build pattern recognition.
          </div>
        </div>
      )}
    </div>
  )
}
