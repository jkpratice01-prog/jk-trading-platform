// src/App.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import './styles/globals.css'
import './styles/components.css'

import Dashboard        from './components/Dashboard.jsx'
import Analyzer         from './components/Analyzer.jsx'
import Compare          from './components/Compare.jsx'
import Tracker          from './components/Tracker.jsx'
import ExportTab        from './components/ExportTab.jsx'
import ScannerTab       from './components/ScannerTab.jsx'
import PriceAlerts      from './components/PriceAlerts.jsx'
import PreMarketTab     from './components/PreMarketTab.jsx'
import FlowScannerTab   from './components/FlowScannerTab.jsx'
import IntradayScanner  from './components/IntradayScanner.jsx'
import TradingTab       from './components/TradingTab.jsx'
import TradeJournal     from './components/TradeJournal.jsx'

import { getQuotes, getDayGainers, getDayLosers } from './api/yahooFinance.js'
import { nowLabel } from './utils/helpers.js'

const TABS = [
  { id: 'dashboard', label: 'Dashboard'  },
  { id: 'analyzer',  label: 'Analyzer'   },
  { id: 'scanner',   label: 'Scanner'    },
  { id: 'premarket', label: 'Pre-Market' },
  { id: 'flow',      label: 'Flow'       },
  { id: 'intraday',  label: 'Intraday'   },
  { id: 'trading',   label: 'Trading'    },
  { id: 'journal',   label: 'Journal'    },
  { id: 'compare',   label: 'Compare'    },
  { id: 'tracker',   label: 'Tracker'    },
  { id: 'export',    label: 'Export'     },
]

const REFRESH_OPTIONS = [
  { value: 0,    label: 'Off'    },
  { value: 0.5,  label: '30s'    },
  { value: 15,   label: '15 min' },
  { value: 60,   label: '1 hr'   },
  { value: 240,  label: '4 hr'   },
]

const MKT_SYMS = ['SPY', 'QQQ', 'IWM', 'DIA', '^VIX', 'GLD', 'SLV']

export default function App() {
  const [theme,         setTheme]         = useState(() => localStorage.getItem('tp_theme')    || 'dark')
  const [fontSize,      setFontSize]      = useState(() => localStorage.getItem('tp_fontsize') || 'normal')
  const [activeTab,     setActiveTab]     = useState('dashboard')
  const [lastUpdated,   setLastUpdated]   = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [refreshMins,   setRefreshMins]   = useState(0)
  const [refreshTick,   setRefreshTick]   = useState(0)   // increments on every completed refresh
  const [countdown,     setCountdown]     = useState(0)   // seconds until next auto-refresh
  const [marketData,    setMarketData]    = useState({})
  const [gainers,       setGainers]       = useState([])
  const [losers,        setLosers]        = useState([])
  const [analyzeTicker,  setAnalyzeTicker]  = useState('AAPL')
  const [exportPlan,     setExportPlan]     = useState(null)
  const [scannerPreset,  setScannerPreset]  = useState(null)  // { symbols, label }

  const timerRef = useRef(null)

  const fetchMarket = useCallback(async () => {
    setLoading(true)
    console.log('%c╔════════════════════════════════════════╗', 'color: #0099ff; font-weight: bold;')
    console.log('%c║  📊 MARKET FETCH STARTED               ║', 'color: #0099ff; font-weight: bold;')
    console.log('%c╚════════════════════════════════════════╝', 'color: #0099ff; font-weight: bold;')
    console.log(`%c⏱️  Timestamp: ${new Date().toLocaleTimeString()}`, 'color: #00ff00;')
    console.log(`%c📍 Fetching: ${MKT_SYMS.join(', ')}`, 'color: #00ff00;')

    try {
      // Fetch major indices
      const q = await getQuotes(MKT_SYMS)
      if (q && Object.keys(q).length > 0) {
        console.log(
          '%c✅ QUOTES RECEIVED',
          'color: #00ff00; font-weight: bold; background: #001100; padding: 4px 8px; border-radius: 3px;',
          Object.keys(q)
        )
        Object.entries(q).forEach(([sym, quote]) => {
          console.log(
            `%c💹 ${sym}`,
            `color: ${quote.regularMarketChangePercent >= 0 ? '#00ff00' : '#ff0000'}; font-weight: bold;`,
            `$${quote.regularMarketPrice?.toFixed(2)} | ${quote.regularMarketChangePercent > 0 ? '+' : ''}${quote.regularMarketChangePercent?.toFixed(2)}% | Vol: ${quote.regularMarketVolume}`,
            `[Source: ${quote.dataSource || 'Unknown'}]`
          )
        })
        setMarketData(q)
      }

      // Fetch gainers/losers independently so one failure doesn't block indices
      getDayGainers(30).then(g => {
        if (g?.length) {
          console.log(`%c🏆 Day Gainers: ${g.length} stocks loaded`, 'color: #00ff00;')
          setGainers(g)
        }
      }).catch(e => console.warn('Gainers failed', e))

      getDayLosers(30).then(l => {
        if (l?.length) {
          console.log(`%c📉 Day Losers: ${l.length} stocks loaded`, 'color: #ff6600;')
          setLosers(l)
        }
      }).catch(e => console.warn('Losers failed', e))

    } catch (e) {
      console.error('%c❌ Market fetch failed', 'color: #ff0000; font-weight: bold;', e)
    } finally {
      setLastUpdated(nowLabel())
      setLoading(false)
      setRefreshTick(t => t + 1)   // signal all child panels to refresh
      console.log('%c╔════════════════════════════════════════╗', 'color: #00ff00; font-weight: bold;')
      console.log('%c║  ✅ MARKET FETCH COMPLETE              ║', 'color: #00ff00; font-weight: bold;')
      console.log('%c╚════════════════════════════════════════╝', 'color: #00ff00; font-weight: bold;')
    }
  }, [])

  // Apply theme + font size to root element and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('tp_theme', theme)
  }, [theme])

  useEffect(() => {
    document.body.classList.toggle('font-large',  fontSize === 'large')
    document.body.classList.toggle('font-normal', fontSize === 'normal')
    localStorage.setItem('tp_fontsize', fontSize)
  }, [fontSize])

  useEffect(() => { fetchMarket() }, [fetchMarket])

  // Auto-refresh timer + live countdown
  useEffect(() => {
    clearInterval(timerRef.current)
    if (refreshMins <= 0) { setCountdown(0); return }

    const intervalMs = refreshMins * 60 * 1000
    setCountdown(Math.round(intervalMs / 1000))

    // Main refresh interval
    timerRef.current = setInterval(fetchMarket, intervalMs)

    // Countdown ticker (every second)
    let secs = Math.round(intervalMs / 1000)
    const cdTimer = setInterval(() => {
      secs -= 1
      if (secs <= 0) secs = Math.round(intervalMs / 1000)
      setCountdown(secs)
    }, 1000)

    return () => { clearInterval(timerRef.current); clearInterval(cdTimer) }
  }, [refreshMins, fetchMarket])

  const openAnalyzer = useCallback((ticker) => {
    setAnalyzeTicker(ticker)
    setActiveTab('analyzer')
  }, [])

  const openSectorScan = useCallback((etfSym, sectorName) => {
    // Import sector stocks map dynamically — they live in Dashboard constants
    const SECTOR_STOCKS = {
      XLK:  ['AAPL','MSFT','NVDA','AMD','INTC','QCOM','AVGO','ORCL','CRM','ADBE','NOW','SNOW'],
      XLF:  ['JPM','BAC','GS','MS','WFC','V','MA','AXP','BLK','SCHW','C','USB'],
      XLE:  ['XOM','CVX','COP','OXY','SLB','EOG','MPC','VLO','PSX','HAL','DVN','FANG'],
      XLV:  ['UNH','JNJ','LLY','ABBV','MRK','PFE','AMGN','GILD','ISRG','TMO','MRNA','REGN'],
      XLY:  ['AMZN','TSLA','MCD','NKE','SBUX','TJX','HD','LOW','BKNG','ROST','CMG','ABNB'],
      XLU:  ['NEE','DUK','SO','D','AEP','EXC','SRE','XEL','ED','WEC','ES','ETR'],
      XLRE: ['AMT','PLD','CCI','EQIX','SPG','O','PSA','DLR','WELL','VICI','EXR','AVB'],
      XLB:  ['LIN','APD','SHW','ECL','NEM','FCX','NUE','VMC','MLM','DD','ALB','CF'],
      XLI:  ['GE','RTX','BA','HON','CAT','DE','UPS','LMT','UNP','MMM','FDX','NSC'],
      XLP:  ['PG','KO','PEP','WMT','COST','MDLZ','PM','MO','CL','EL','KHC','GIS'],
    }
    const stocks = SECTOR_STOCKS[etfSym] || []
    setScannerPreset({ symbols: stocks, label: `${sectorName} sector (${etfSym})` })
    setActiveTab('scanner')
  }, [])

  const openExport = useCallback((plan) => {
    setExportPlan(plan)
    setActiveTab('export')
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: '46px', flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderBottom: '0.5px solid var(--border-subtle)',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{
            fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
            marginRight: '8px', letterSpacing: '-0.02em',
          }}>
            📈 Trading Platform
          </span>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              fontSize: '14px', padding: '3px 7px', border: '0.5px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)', cursor: 'pointer',
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
              lineHeight: 1, marginRight: '2px',
            }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {/* Font size toggle */}
          <button
            onClick={() => setFontSize(s => s === 'normal' ? 'large' : 'normal')}
            title={fontSize === 'normal' ? 'Increase text size' : 'Decrease text size'}
            style={{
              fontSize: fontSize === 'normal' ? '11px' : '13px',
              fontWeight: 700, padding: '3px 7px',
              border: '0.5px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)', cursor: 'pointer',
              background: fontSize === 'large' ? 'var(--blue-dim)' : 'var(--bg-tertiary)',
              color: fontSize === 'large' ? 'var(--blue)' : 'var(--text-secondary)',
              lineHeight: 1, marginRight: '8px', letterSpacing: '-0.02em',
            }}
          >
            {fontSize === 'normal' ? 'A+' : 'A−'}
          </button>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: '12px', padding: '5px 13px',
                borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
                background: activeTab === tab.id ? 'var(--bg-tertiary)' : 'transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 500 : 400,
                borderBottom: activeTab === tab.id ? '2px solid var(--blue)' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <PriceAlerts />
          {lastUpdated && (
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
              Updated {lastUpdated}
            </span>
          )}
          {countdown > 0 && (
            <span style={{
              fontSize: '10px', fontFamily: 'var(--font-mono)',
              color: countdown <= 5 ? 'var(--amber-text)' : 'var(--text-tertiary)',
              minWidth: 28, textAlign: 'right',
            }}>
              {countdown}s
            </span>
          )}
          <select
            value={refreshMins}
            onChange={e => setRefreshMins(Number(e.target.value))}
            style={{ fontSize: '11px', padding: '3px 8px' }}
          >
            {REFRESH_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={fetchMarket}
            disabled={loading}
            style={{ fontSize: '11px', padding: '4px 12px', minWidth: 72 }}
          >
            {loading ? 'Loading...' : '↻ Refresh'}
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
        {activeTab === 'dashboard' && (
          <Dashboard
            marketData={marketData}
            gainers={gainers}
            losers={losers}
            onAnalyze={openAnalyzer}
            onRefresh={fetchMarket}
            onScanSector={openSectorScan}
            refreshTick={refreshTick}
          />
        )}
        {activeTab === 'analyzer' && (
          <Analyzer initialTicker={analyzeTicker} onExport={openExport} />
        )}
        {activeTab === 'scanner' && (
          <ScannerTab onAnalyze={openAnalyzer} preset={scannerPreset} onPresetConsumed={() => setScannerPreset(null)} />
        )}
        {activeTab === 'premarket' && (
          <PreMarketTab onAnalyze={openAnalyzer} />
        )}
        {activeTab === 'flow' && (
          <FlowScannerTab onAnalyze={openAnalyzer} />
        )}
        {activeTab === 'intraday' && (
          <IntradayScanner onAnalyze={openAnalyzer} />
        )}
        {activeTab === 'trading' && (
          <TradingTab onAnalyze={openAnalyzer} />
        )}
        {activeTab === 'journal' && (
          <TradeJournal onAnalyze={openAnalyzer} />
        )}
        {activeTab === 'compare' && (
          <Compare onAnalyze={openAnalyzer} />
        )}
        {activeTab === 'tracker' && (
          <Tracker onAnalyze={openAnalyzer} />
        )}
        {activeTab === 'export' && (
          <ExportTab initialPlan={exportPlan} />
        )}
      </main>
    </div>
  )
}
