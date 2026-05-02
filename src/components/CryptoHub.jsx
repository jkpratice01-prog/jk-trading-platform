// src/components/CryptoHub.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { backendCryptoOverview, backendCryptoTop, backendCryptoInfo } from '../api/backend.js'
import CandlestickChart from './CandlestickChart.jsx'

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmtPrice(n) {
  if (n == null || isNaN(n)) return '—'
  if (n < 0.0001) return n.toFixed(8)
  if (n < 1) return n.toFixed(6)
  if (n < 10) return n.toFixed(4)
  if (n < 1000) return n.toFixed(2)
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtLarge(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2)  + 'B'
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2)  + 'M'
  if (n >= 1e3)  return '$' + (n / 1e3).toFixed(1)  + 'K'
  return '$' + n.toFixed(0)
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function pctColor(n) {
  if (n == null || isNaN(n)) return 'var(--text-secondary)'
  return n >= 0 ? 'var(--green-text)' : 'var(--red-text)'
}

// ── Fear & Greed label color ──────────────────────────────────────────────────
function fgColor(value) {
  if (value == null) return 'var(--text-secondary)'
  if (value <= 25)  return '#ef4444'
  if (value <= 45)  return '#f97316'
  if (value <= 55)  return '#fbc02d'
  if (value <= 75)  return '#86efac'
  return '#22c55e'
}

// ATH distance color
function athColor(pct) {
  if (pct == null) return 'var(--text-secondary)'
  const abs = Math.abs(pct)
  if (abs <= 10)  return 'var(--green-text)'
  if (abs <= 30)  return 'var(--amber-text)'
  return 'var(--red-text)'
}

const QUICK_PICKS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'AVAX']

// ── Component ─────────────────────────────────────────────────────────────────
export default function CryptoHub() {
  const [overview,        setOverview]        = useState(null)
  const [topCoins,        setTopCoins]        = useState([])
  const [coinInfo,        setCoinInfo]        = useState(null)
  const [selectedSymbol,  setSelectedSymbol]  = useState('BTC')
  const [searchInput,     setSearchInput]     = useState('')
  const [tableSearch,     setTableSearch]     = useState('')
  const [sortCol,         setSortCol]         = useState('rank')
  const [sortDir,         setSortDir]         = useState(1)   // 1 = asc, -1 = desc
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [loadingTop,      setLoadingTop]      = useState(false)
  const [loadingCoin,     setLoadingCoin]     = useState(false)
  const intervalRef = useRef(null)

  // ── Data fetchers ──────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true)
    try {
      const data = await backendCryptoOverview()
      setOverview(data)
    } catch (e) {
      console.warn('[CryptoHub] overview error', e)
    } finally {
      setLoadingOverview(false)
    }
  }, [])

  const fetchTopCoins = useCallback(async () => {
    setLoadingTop(true)
    try {
      const data = await backendCryptoTop(50)
      setTopCoins(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('[CryptoHub] top coins error', e)
    } finally {
      setLoadingTop(false)
    }
  }, [])

  const fetchCoinInfo = useCallback(async (sym) => {
    setLoadingCoin(true)
    setCoinInfo(null)
    try {
      const data = await backendCryptoInfo(sym)
      setCoinInfo(data)
    } catch (e) {
      console.warn('[CryptoHub] coin info error', e)
      setCoinInfo(null)
    } finally {
      setLoadingCoin(false)
    }
  }, [])

  const selectCoin = useCallback((sym) => {
    setSelectedSymbol(sym)
    setSearchInput('')
  }, [])

  // ── Initial load + auto-refresh every 60s ─────────────────────────────────
  useEffect(() => {
    fetchOverview()
    fetchTopCoins()
  }, [fetchOverview, fetchTopCoins])

  useEffect(() => {
    fetchCoinInfo(selectedSymbol)
  }, [selectedSymbol, fetchCoinInfo])

  useEffect(() => {
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      fetchOverview()
      fetchTopCoins()
    }, 60000)
    return () => clearInterval(intervalRef.current)
  }, [fetchOverview, fetchTopCoins])

  // ── Top movers from topCoins ───────────────────────────────────────────────
  const gainers = [...topCoins]
    .filter(c => c.change24h != null)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 5)

  const losers = [...topCoins]
    .filter(c => c.change24h != null)
    .sort((a, b) => a.change24h - b.change24h)
    .slice(0, 5)

  // ── Sorted table ───────────────────────────────────────────────────────────
  const colNum  = k => (r) => r[k] ?? (sortDir === 1 ? Infinity : -Infinity)
  const colStr  = k => (r) => r[k] ?? ''

  const sortFns = {
    rank:      colNum('rank'),
    name:      colStr('name'),
    price:     colNum('price'),
    change1h:  colNum('change1h'),
    change24h: colNum('change24h'),
    change7d:  colNum('change7d'),
    marketCap: colNum('marketCap'),
    volume24h: colNum('volume24h'),
    athChange: colNum('athChange'),
  }

  const filteredCoins = topCoins
    .filter(c => {
      if (!tableSearch) return true
      const q = tableSearch.toLowerCase()
      return c.symbol?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const fn = sortFns[sortCol] || sortFns.rank
      const av = fn(a), bv = fn(b)
      if (av < bv) return -sortDir
      if (av > bv) return  sortDir
      return 0
    })

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => -d)
    else { setSortCol(col); setSortDir(col === 'rank' || col === 'name' ? 1 : -1) }
  }

  const sortArrow = (col) => sortCol === col ? (sortDir === 1 ? ' ▲' : ' ▼') : ''

  // ── Fear & Greed gauge marker position ────────────────────────────────────
  const fgValue = overview?.fearGreed?.value
  const fgPct   = fgValue != null ? `${fgValue}%` : '50%'

  // ── Supply circulating % ──────────────────────────────────────────────────
  const circPct = coinInfo?.circulatingSupply && coinInfo?.maxSupply
    ? Math.min(100, (coinInfo.circulatingSupply / coinInfo.maxSupply) * 100)
    : coinInfo?.circulatingSupply && coinInfo?.totalSupply
    ? Math.min(100, (coinInfo.circulatingSupply / coinInfo.totalSupply) * 100)
    : null

  // ── Search submit ─────────────────────────────────────────────────────────
  const handleSearchSubmit = (e) => {
    e.preventDefault()
    const val = searchInput.trim()
    if (val) selectCoin(val.toUpperCase())
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── A. Global Market Bar ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center',
        background: 'var(--bg-secondary)',
        border: '0.5px solid var(--border-subtle)',
        borderRadius: 'var(--r-md)',
        padding: '8px 12px',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginRight: '4px' }}>
          CRYPTO MARKET
        </span>
        {loadingOverview && !overview && (
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Loading…</span>
        )}
        {overview && (
          <>
            <StatBadge
              label="Market Cap"
              value={fmtLarge(overview.totalMarketCap)}
              sub={overview.marketCapChange24h != null
                ? fmtPct(overview.marketCapChange24h)
                : null}
              subColor={pctColor(overview.marketCapChange24h)}
            />
            <StatBadge label="BTC Dom" value={overview.btcDominance != null ? `${overview.btcDominance.toFixed(1)}%` : '—'} />
            <StatBadge label="ETH Dom" value={overview.ethDominance  != null ? `${overview.ethDominance.toFixed(1)}%`  : '—'} />
            <StatBadge label="24h Volume" value={fmtLarge(overview.totalVolume24h)} />
            <StatBadge label="Cryptos" value={overview.activeCryptos?.toLocaleString() ?? '—'} />
            {overview.fearGreed?.value != null && (
              <StatBadge
                label="Fear & Greed"
                value={`${overview.fearGreed.value} — ${overview.fearGreed.label}`}
                valueColor={fgColor(overview.fearGreed.value)}
              />
            )}
          </>
        )}
      </div>

      {/* ── B. Fear & Greed + Top Movers ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>

        {/* Fear & Greed Gauge */}
        <div className="card">
          <div className="panel-hd">
            <span style={{ fontWeight: 600, fontSize: '12px' }}>Fear &amp; Greed Index</span>
          </div>
          {overview?.fearGreed?.value != null ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
              <span style={{
                fontSize: '52px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                color: fgColor(fgValue), lineHeight: 1,
              }}>
                {fgValue}
              </span>
              <span style={{
                fontSize: '14px', fontWeight: 600, letterSpacing: '0.04em',
                color: fgColor(fgValue),
                textTransform: 'uppercase',
              }}>
                {overview.fearGreed.label}
              </span>

              {/* Gradient bar */}
              <div style={{ width: '100%', position: 'relative', marginTop: '4px' }}>
                <div style={{
                  height: '10px', borderRadius: '5px',
                  background: 'linear-gradient(to right, #ef4444, #f97316, #fbc02d, #86efac, #22c55e)',
                }} />
                {/* Marker */}
                <div style={{
                  position: 'absolute', top: '-3px',
                  left: `calc(${fgPct} - 7px)`,
                  width: '14px', height: '16px',
                  background: 'var(--text-primary)',
                  borderRadius: '3px',
                  clipPath: 'polygon(20% 0%, 80% 0%, 100% 40%, 50% 100%, 0% 40%)',
                }} />
                {/* Labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  {['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'].map(l => (
                    <span key={l} style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>{l}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>
              {loadingOverview ? 'Loading…' : 'No data'}
            </div>
          )}
        </div>

        {/* Top Movers */}
        <div className="card">
          <div className="panel-hd">
            <span style={{ fontWeight: 600, fontSize: '12px' }}>Top Movers (24h)</span>
            {loadingTop && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Loading…</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Gainers */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--green-text)', marginBottom: '6px' }}>
                Top Gainers
              </div>
              {gainers.map(c => (
                <MoverRow key={c.id} coin={c} pct={c.change24h} onClick={() => selectCoin(c.symbol)} />
              ))}
              {gainers.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>—</div>
              )}
            </div>
            {/* Losers */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--red-text)', marginBottom: '6px' }}>
                Top Losers
              </div>
              {losers.map(c => (
                <MoverRow key={c.id} coin={c} pct={c.change24h} onClick={() => selectCoin(c.symbol)} />
              ))}
              {losers.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>—</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── C. Coin Analyzer ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '12px' }}>

        {/* Left: coin info panel */}
        <div className="card" style={{ gap: '10px' }}>
          {/* Search + quick picks */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '6px' }}>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search coin… (BTC, ETH, solana…)"
              style={{
                flex: 1, fontSize: '12px', padding: '5px 8px',
                background: 'var(--bg-secondary)', border: '0.5px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)', color: 'var(--text-primary)',
              }}
            />
            <button type="submit" className="btn btn-primary" style={{ fontSize: '11px', padding: '5px 10px' }}>
              Go
            </button>
          </form>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {QUICK_PICKS.map(sym => (
              <button
                key={sym}
                onClick={() => selectCoin(sym)}
                style={{
                  fontSize: '11px', padding: '3px 8px',
                  border: '0.5px solid var(--border-subtle)',
                  borderRadius: 'var(--r-pill)', cursor: 'pointer',
                  background: selectedSymbol === sym ? 'var(--blue-dim)' : 'var(--bg-secondary)',
                  color: selectedSymbol === sym ? 'var(--blue)' : 'var(--text-secondary)',
                  fontWeight: selectedSymbol === sym ? 600 : 400,
                }}
              >
                {sym}
              </button>
            ))}
          </div>

          {loadingCoin && (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '16px 0' }}>
              Loading {selectedSymbol}…
            </div>
          )}

          {!loadingCoin && coinInfo && (
            <>
              {/* Coin header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {coinInfo.image && (
                  <img src={coinInfo.image} alt={coinInfo.symbol}
                    style={{ width: 36, height: 36, borderRadius: '50%' }}
                    onError={e => { e.target.style.display = 'none' }}
                  />
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {coinInfo.name}
                    </span>
                    <span style={{
                      fontSize: '10px', padding: '1px 6px',
                      background: 'var(--bg-tertiary)', border: '0.5px solid var(--border-subtle)',
                      borderRadius: 'var(--r-pill)', color: 'var(--text-secondary)',
                    }}>
                      {coinInfo.symbol}
                    </span>
                    {coinInfo.rank && (
                      <span style={{
                        fontSize: '10px', padding: '1px 6px',
                        background: 'var(--blue-dim)', borderRadius: 'var(--r-pill)',
                        color: 'var(--blue)',
                      }}>
                        #{coinInfo.rank}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Big price */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '26px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                }}>
                  ${fmtPrice(coinInfo.price)}
                </span>
                <span style={{
                  fontSize: '14px', fontWeight: 600,
                  color: pctColor(coinInfo.change24h),
                }}>
                  {fmtPct(coinInfo.change24h)}
                </span>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <MiniStat label="Market Cap"   value={fmtLarge(coinInfo.marketCap)} />
                <MiniStat label="FDV"          value={fmtLarge(coinInfo.fdv)} />
                <MiniStat label="24h Volume"   value={fmtLarge(coinInfo.volume24h)} />
                <MiniStat label="Vol/MCap"     value={coinInfo.volMcapRatio != null ? `${(coinInfo.volMcapRatio * 100).toFixed(2)}%` : '—'} />
                <MiniStat label="24h High"     value={`$${fmtPrice(coinInfo.high24h)}`} />
                <MiniStat label="24h Low"      value={`$${fmtPrice(coinInfo.low24h)}`} />
              </div>

              {/* ATH row */}
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)',
                padding: '7px 10px', display: 'flex', gap: '12px', flexWrap: 'wrap',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ATH
                </span>
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  ${fmtPrice(coinInfo.ath)}
                </span>
                {coinInfo.athDate && (
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{coinInfo.athDate}</span>
                )}
                <span style={{ fontSize: '12px', fontWeight: 600, color: athColor(coinInfo.athChange) }}>
                  {fmtPct(coinInfo.athChange)}
                </span>
              </div>

              {/* ATL row */}
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)',
                padding: '7px 10px', display: 'flex', gap: '12px', flexWrap: 'wrap',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ATL
                </span>
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  ${fmtPrice(coinInfo.atl)}
                </span>
                {coinInfo.atlDate && (
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{coinInfo.atlDate}</span>
                )}
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--green-text)' }}>
                  {fmtPct(coinInfo.atlChange)}
                </span>
              </div>

              {/* Supply */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Supply
                  </span>
                  {circPct != null && (
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      {circPct.toFixed(1)}% circulating
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', flexWrap: 'wrap' }}>
                  <SupplyStat label="Circulating" value={coinInfo.circulatingSupply} />
                  <SupplyStat label="Total"       value={coinInfo.totalSupply} />
                  <SupplyStat label="Max"         value={coinInfo.maxSupply} />
                </div>
                {circPct != null && (
                  <div style={{ height: '5px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${circPct}%`,
                      background: 'var(--blue)', transition: 'width 0.3s',
                    }} />
                  </div>
                )}
              </div>

              {/* Change pills row */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { label: '1h',  val: coinInfo.change1h  },
                  { label: '24h', val: coinInfo.change24h },
                  { label: '7d',  val: coinInfo.change7d  },
                  { label: '30d', val: coinInfo.change30d },
                ].map(({ label, val }) => (
                  <div key={label} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    background: 'var(--bg-secondary)', padding: '5px 10px',
                    borderRadius: 'var(--r-md)', gap: '2px',
                    border: `0.5px solid ${val != null ? (val >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--border-subtle)'}20`,
                  }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: pctColor(val) }}>
                      {fmtPct(val)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!loadingCoin && !coinInfo && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>
              No data for "{selectedSymbol}"
            </div>
          )}
        </div>

        {/* Right: chart panel */}
        <div className="card" style={{ gap: '8px' }}>
          <div className="panel-hd">
            <span style={{ fontWeight: 600, fontSize: '12px' }}>
              {coinInfo ? `${coinInfo.name} (${coinInfo.yfTicker || selectedSymbol + '-USD'})` : `${selectedSymbol}-USD Chart`}
            </span>
          </div>
          <CandlestickChart
            symbol={coinInfo?.yfTicker || `${selectedSymbol}-USD`}
            height={380}
          />
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'right' }}>
            Chart data via yfinance · crypto data may be slightly delayed
          </div>
        </div>
      </div>

      {/* ── D. Market Rankings Table ─────────────────────────────────────────── */}
      <div className="card" style={{ gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Market Rankings</span>
          <input
            value={tableSearch}
            onChange={e => setTableSearch(e.target.value)}
            placeholder="Filter by name or symbol…"
            style={{
              fontSize: '11px', padding: '4px 8px', width: '200px',
              background: 'var(--bg-secondary)', border: '0.5px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)', color: 'var(--text-primary)',
            }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
                {[
                  { col: 'rank',      label: '#'        },
                  { col: 'name',      label: 'Coin'     },
                  { col: 'price',     label: 'Price'    },
                  { col: 'change1h',  label: '1h %'     },
                  { col: 'change24h', label: '24h %'    },
                  { col: 'change7d',  label: '7d %'     },
                  { col: 'marketCap', label: 'Mkt Cap'  },
                  { col: 'volume24h', label: '24h Vol'  },
                  { col: 'athChange', label: 'ATH %'    },
                ].map(({ col, label }) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    style={{
                      padding: '6px 8px', textAlign: col === 'name' ? 'left' : 'right',
                      cursor: 'pointer', fontWeight: 500,
                      color: sortCol === col ? 'var(--blue)' : 'var(--text-tertiary)',
                      whiteSpace: 'nowrap', userSelect: 'none',
                    }}
                  >
                    {label}{sortArrow(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCoins.map(coin => (
                <tr
                  key={coin.id}
                  onClick={() => selectCoin(coin.symbol)}
                  style={{
                    borderBottom: '0.5px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: selectedSymbol === coin.symbol ? 'var(--blue-dim)' : 'transparent',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = selectedSymbol === coin.symbol ? 'var(--blue-dim)' : 'transparent'}
                >
                  <td style={{ padding: '6px 8px', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                    {coin.rank ?? '—'}
                  </td>
                  <td style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {coin.image && (
                      <img src={coin.image} alt={coin.symbol}
                        style={{ width: 18, height: 18, borderRadius: '50%' }}
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    )}
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{coin.name}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>{coin.symbol}</span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    ${fmtPrice(coin.price)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <PctPill value={coin.change1h} />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <PctPill value={coin.change24h} />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <PctPill value={coin.change7d} />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {fmtLarge(coin.marketCap)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {fmtLarge(coin.volume24h)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <span style={{ fontWeight: 500, color: athColor(coin.athChange), fontFamily: 'var(--font-mono)' }}>
                      {fmtPct(coin.athChange)}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredCoins.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                    {loadingTop ? 'Loading market data…' : 'No results'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBadge({ label, value, sub, subColor, valueColor }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '1px',
      padding: '3px 8px',
      background: 'var(--bg-tertiary)',
      border: '0.5px solid var(--border-subtle)',
      borderRadius: 'var(--r-md)',
    }}>
      <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: valueColor || 'var(--text-primary)', whiteSpace: 'nowrap' }}>
        {value}
        {sub && (
          <span style={{ fontSize: '10px', marginLeft: '4px', color: subColor || 'var(--text-secondary)' }}>
            {sub}
          </span>
        )}
      </span>
    </div>
  )
}

function MoverRow({ coin, pct, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 6px', marginBottom: '3px',
        borderRadius: 'var(--r-sm)', cursor: 'pointer',
        background: 'var(--bg-secondary)',
        gap: '6px',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
        {coin.image && (
          <img src={coin.image} alt={coin.symbol}
            style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }}
            onError={e => { e.target.style.display = 'none' }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{coin.symbol}</span>
          <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginLeft: '4px' }}>
            {coin.name?.length > 10 ? coin.name.slice(0, 10) + '…' : coin.name}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          ${fmtPrice(coin.price)}
        </span>
        <PctPill value={pct} />
      </div>
    </div>
  )
}

function PctPill({ value }) {
  if (value == null || isNaN(value)) {
    return <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>—</span>
  }
  const pos = value >= 0
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)',
      padding: '1px 5px', borderRadius: 'var(--r-pill)',
      background: pos ? 'var(--green-dim)' : 'var(--red-dim)',
      color: pos ? 'var(--green-text)' : 'var(--red-text)',
    }}>
      {fmtPct(value)}
    </span>
  )
}

function MiniStat({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '0.5px solid var(--border-subtle)',
      borderRadius: 'var(--r-sm)', padding: '6px 8px',
    }}>
      <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ fontSize: '11px', fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

function SupplyStat({ label, value }) {
  const fmt = (n) => {
    if (n == null) return '—'
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T'
    if (n >= 1e9)  return (n / 1e9).toFixed(2)  + 'B'
    if (n >= 1e6)  return (n / 1e6).toFixed(2)  + 'M'
    if (n >= 1e3)  return (n / 1e3).toFixed(1)  + 'K'
    return n.toLocaleString()
  }
  return (
    <div>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}: </span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(value)}</span>
    </div>
  )
}