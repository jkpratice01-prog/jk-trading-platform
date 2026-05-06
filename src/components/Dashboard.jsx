// src/components/Dashboard.jsx
import { useState, useEffect, Fragment } from 'react'
import { getQuotes } from '../api/yahooFinance.js'
import { fmtPrice, fmtPct, fmtVol, chgColor, chgBadge } from '../utils/helpers.js'
import OptionsDetail    from './OptionsDetail.jsx'
import MarketInternals  from './MarketInternals.jsx'
import { backendOptionsFlow, backendOptionsFlowBatch, backendEarnings } from '../api/backend.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTORS = [
  { n: 'Tech',    s: 'XLK' }, { n: 'Energy',  s: 'XLE' },
  { n: 'Finance', s: 'XLF' }, { n: 'Health',  s: 'XLV' },
  { n: 'Cons.',   s: 'XLY' }, { n: 'Utility', s: 'XLU' },
  { n: 'RE',      s: 'XLRE'}, { n: 'Mater.',  s: 'XLB' },
  { n: 'Indust.', s: 'XLI' }, { n: 'Staples', s: 'XLP' },
]

// Top stocks per sector — used when clicking a heatmap tile
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

const DEFAULT_OPT_SYMS = [
  'SPY','QQQ','IWM','DIA',
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN',
  'TSLA','AMD','PLTR','COIN','MSTR',
  'JPM','GS','BAC',
  'XOM','OXY',
  'LLY','MRNA',
]

const OPT_CATEGORIES = [
  { label: 'ETFs',     syms: ['SPY','QQQ','IWM','DIA'] },
  { label: 'Big tech', syms: ['AAPL','MSFT','NVDA','GOOGL','META','AMZN'] },
  { label: 'Momentum', syms: ['TSLA','AMD','PLTR','COIN','MSTR'] },
  { label: 'Finance',  syms: ['JPM','GS','BAC'] },
  { label: 'Energy',   syms: ['XOM','OXY'] },
  { label: 'Health',   syms: ['LLY','MRNA'] },
]

// Earnings data is loaded dynamically — no hardcoded list

function seededRand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function genOptData(syms, seed) {
  return Object.fromEntries(syms.map((sym, i) => ({
    [sym]: {
      pc:   +(0.45 + seededRand(seed + i) * 1.2).toFixed(2),
      ivr:  Math.round(25 + seededRand(seed + i + 100) * 60),
      bull: (0.45 + seededRand(seed + i) * 1.2) < 0.8,
    }
  })).map(obj => Object.entries(obj)[0]))
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard({ marketData, gainers, losers, onAnalyze, onRefresh, onScanSector, refreshTick = 0 }) {
  const [bullTab,    setBullTab]    = useState('gainers')
  const [sectorQ,    setSectorQ]    = useState({})
  const [optQ,       setOptQ]       = useState({})
  const [optData,    setOptData]    = useState({})
  const [optSyms,    setOptSyms]    = useState(() =>
    JSON.parse(localStorage.getItem('opt_watchlist') || JSON.stringify(DEFAULT_OPT_SYMS))
  )
  const [optInput,   setOptInput]   = useState('')
  const [optFilter,  setOptFilter]  = useState('All')
  const [showManage, setShowManage] = useState(false)
  const [loadSect,   setLoadSect]   = useState(false)
  const [loadOpt,    setLoadOpt]    = useState(false)
  const [tracked,    setTracked]    = useState(() =>
    JSON.parse(localStorage.getItem('tracked_earn') || '[]')
  )
  const [earnData,   setEarnData]   = useState([])
  const [loadEarn,   setLoadEarn]   = useState(false)

  // Chain state — rendered BELOW the table, not inside tbody
  const [chainSym,   setChainSym]   = useState(null)
  const [chainPrice, setChainPrice] = useState(null)
  const [chainTick,  setChainTick]  = useState(0)    // bumped on auto-refresh to re-fetch open chain
  // Flow data from DB (call vs put premium per ticker)
  const [flowData,   setFlowData]   = useState({})

  useEffect(() => {
    loadSectors()
    const t1 = setTimeout(() => loadOptions(),  1500)
    const t2 = setTimeout(() => loadEarnings(), 3000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])
  useEffect(() => { if (optSyms.length) loadOptions() }, [optSyms])

  // Auto-refresh: when App signals a new tick, refresh options watchlist + open chain
  useEffect(() => {
    if (refreshTick === 0) return   // skip initial mount
    loadOptions()
    loadSectors()
    if (chainSym) setChainTick(t => t + 1)   // tells open OptionsDetail to re-fetch
  }, [refreshTick])

  async function loadFlow(sym) {
    try {
      const d = await backendOptionsFlow(sym)
      if (d?.symbol) setFlowData(prev => ({ ...prev, [d.symbol]: d }))
    } catch {}
  }

  async function loadSectors() {
    setLoadSect(true)
    try {
      const q = await getQuotes(SECTORS.map(s => s.s))
      if (q && Object.keys(q).length > 0) setSectorQ(q)
    } catch(e) { console.warn('Sector load failed', e) }
    setLoadSect(false)
  }

  async function loadOptions() {
    setLoadOpt(true)
    try {
      const [q, flows] = await Promise.all([
        getQuotes(optSyms),
        backendOptionsFlowBatch(optSyms),
      ])
      if (Object.keys(q).length > 0) setOptQ(q)
      // Merge real flow data — overrides fake genOptData for any symbol that has DB data
      if (Object.keys(flows).length > 0) {
        setFlowData(prev => ({ ...prev, ...flows }))
      }
      setOptData(genOptData(optSyms, Math.floor(Date.now() / 60000)))
    } catch(e) { console.warn('Options load failed', e) }
    setLoadOpt(false)
  }

  async function loadEarnings() {
    setLoadEarn(true)
    try {
      // Fetch earnings for options watchlist + major names not in watchlist
      const base = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','PLTR',
                    'NFLX','CRM','ORCL','SHOP','COIN','JPM','BAC','GS','XOM','LLY','MRNA']
      const all  = [...new Set([...optSyms, ...base])]
      const d    = await backendEarnings(all)
      if (d?.earnings?.length) setEarnData(d.earnings)
    } catch(e) { console.warn('Earnings load failed', e) }
    setLoadEarn(false)
  }

  function saveOptSyms(next) {
    setOptSyms(next)
    localStorage.setItem('opt_watchlist', JSON.stringify(next))
  }

  function addOptTicker() {
    const t = optInput.trim().toUpperCase().replace(/[^A-Z0-9^.]/g, '')
    if (!t || optSyms.includes(t)) { setOptInput(''); return }
    saveOptSyms([...optSyms, t])
    setOptInput('')
  }

  function removeOptTicker(sym) {
    saveOptSyms(optSyms.filter(s => s !== sym))
    if (chainSym === sym) setChainSym(null)
  }

  function openChain(sym, price) {
    if (chainSym === sym) { setChainSym(null); return }
    setChainSym(sym)
    setChainPrice(price || null)
  }

  function toggleTrack(sym) {
    const next = tracked.includes(sym) ? tracked.filter(s => s !== sym) : [...tracked, sym]
    setTracked(next)
    localStorage.setItem('tracked_earn', JSON.stringify(next))
  }

  const spxDisplay = marketData['^GSPC'] || marketData['SPY']
  const ndxDisplay = marketData['^NDX']  || marketData['QQQ']
  const vix        = marketData['^VIX']
  const vixV       = vix?.regularMarketPrice

  const filteredSyms = optFilter === 'All'
    ? optSyms
    : (OPT_CATEGORIES.find(c => c.label === optFilter)?.syms || []).filter(s => optSyms.includes(s))

  const listData = bullTab === 'gainers' ? gainers : losers

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Market cards ──────────────────────────────────────────────── */}
      <div className="g4">
        <div className="metric">
          <div className="metric-label">S&amp;P 500 {!marketData['^GSPC'] && spxDisplay ? <span style={{fontSize:9,color:'var(--text-tertiary)'}}>(SPY)</span> : null}</div>
          <div className="metric-value" style={{fontSize:16}}>
            {spxDisplay ? spxDisplay.regularMarketPrice?.toLocaleString(undefined,{maximumFractionDigits:0}) : <span className="skeleton" style={{width:70,height:18,display:'inline-block',borderRadius:4}}/>}
          </div>
          <div className={`metric-sub ${chgColor(spxDisplay?.regularMarketChangePercent)}`}>
            {spxDisplay ? fmtPct(spxDisplay.regularMarketChangePercent) : 'Loading...'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Nasdaq {!marketData['^NDX'] && ndxDisplay ? <span style={{fontSize:9,color:'var(--text-tertiary)'}}>(QQQ)</span> : null}</div>
          <div className="metric-value" style={{fontSize:16}}>
            {ndxDisplay ? ndxDisplay.regularMarketPrice?.toLocaleString(undefined,{maximumFractionDigits:0}) : <span className="skeleton" style={{width:70,height:18,display:'inline-block',borderRadius:4}}/>}
          </div>
          <div className={`metric-sub ${chgColor(ndxDisplay?.regularMarketChangePercent)}`}>
            {ndxDisplay ? fmtPct(ndxDisplay.regularMarketChangePercent) : 'Loading...'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">VIX</div>
          <div className="metric-value" style={{fontSize:16}}>
            {vix ? vixV?.toFixed(1) : <span className="skeleton" style={{width:50,height:18,display:'inline-block',borderRadius:4}}/>}
          </div>
          <div className={`metric-sub ${!vixV?'neu':vixV<20?'up':vixV<30?'warn':'dn'}`}>
            {vix ? `${fmtPct(vix.regularMarketChangePercent)} · ${vixV<15?'Low fear':vixV<25?'Moderate':vixV<35?'High fear':'Extreme fear'}` : 'Loading...'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Fear &amp; greed (est.)</div>
          <div className="metric-value" style={{fontSize:16}}>
            {vixV ? Math.max(5,Math.min(95,Math.round(100-(vixV-10)*2.5))) : '—'}
          </div>
          <div className={`metric-sub ${!vixV?'neu':vixV>30?'dn':vixV>20?'warn':'up'}`}>
            {vixV ? (vixV>35?'Extreme fear':vixV>25?'Fear':vixV>18?'Neutral':vixV>12?'Greed':'Extreme greed') : 'Loading...'}
          </div>
        </div>
      </div>

      {/* ── ETF ticker strip ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { sym: 'SPY',  label: 'SPY'   },
          { sym: 'QQQ',  label: 'QQQ'   },
          { sym: 'IWM',  label: 'IWM'   },
          { sym: 'GLD',  label: 'Gold'  },
          { sym: 'SLV',  label: 'Silver'},
          { sym: 'USO',  label: 'Oil'   },
        ].map(({ sym, label }) => {
          const q   = marketData[sym]
          const chg = q?.regularMarketChangePercent
          const up  = chg >= 0
          return (
            <div key={sym} onClick={() => onAnalyze(sym)} style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '5px 12px', borderRadius: 'var(--r-md)',
              background: 'var(--bg-secondary)',
              border: `0.5px solid ${q ? (up ? 'var(--green)33' : 'var(--red)33') : 'var(--border-subtle)'}`,
              transition: 'background var(--dur) var(--ease)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
              {q ? (
                <>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {fmtPrice(q.regularMarketPrice)}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: up ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 500 }}>
                    {up ? '+' : ''}{chg?.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="skeleton" style={{ width: 60, height: 10, display: 'inline-block', borderRadius: 3 }} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Market Internals ──────────────────────────────────────────── */}
      <MarketInternals refreshTick={refreshTick} />

      {/* ── Sector heatmap — single full row ──────────────────────────── */}
      <div className="card" style={{padding:'8px 12px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
          <span className="panel-title">Sectors</span>
          <button className="btn btn-icon" style={{fontSize:10}} onClick={loadSectors}>{loadSect?<span className="spinner"/>:'↻'}</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(10,minmax(0,1fr))',gap:4}}>
          {SECTORS.map(sec=>{
            const q=sectorQ[sec.s], c=q?.regularMarketChangePercent, up=c>=0
            return (
              <div key={sec.s} onClick={()=>onScanSector ? onScanSector(sec.s, sec.n) : onAnalyze(sec.s)} style={{
                borderRadius:'var(--r-md)',padding:'5px 3px',textAlign:'center',cursor:'pointer',
                background:c==null?'var(--bg-tertiary)':up?'var(--green-dim)':'var(--red-dim)',
                border:`0.5px solid ${c==null?'var(--border-subtle)':up?'var(--green)':'var(--red)'}33`,
              }}>
                <div style={{fontSize:9,color:c==null?'var(--text-tertiary)':up?'var(--green-text)':'var(--red-text)',fontWeight:500,marginBottom:2}}>{sec.n}</div>
                <div style={{fontSize:11,fontWeight:600,fontFamily:'var(--font-mono)',color:c==null?'var(--text-tertiary)':up?'var(--green-text)':'var(--red-text)'}}>
                  {c!=null?fmtPct(c):'—'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Market scanner (moved up) ──────────────────────────────────── */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Market scanner</span>
          <div className="panel-actions">
            <button className={`pill ${bullTab==='gainers'?'act':''}`} onClick={()=>setBullTab('gainers')}>Gainers</button>
            <button className={`pill ${bullTab==='losers'?'act':''}`}  onClick={()=>setBullTab('losers')}>Losers</button>
            <button className="btn btn-icon" onClick={onRefresh}>↻</button>
          </div>
        </div>
        <table className="data-table">
          <thead><tr>
            <th style={{width:'18%'}}>Ticker</th><th style={{width:'20%'}}>Price</th>
            <th style={{width:'18%'}}>Chg%</th><th style={{width:'20%'}}>Volume</th><th>Signal</th>
          </tr></thead>
          <tbody>
            {listData.slice(0,30).map(q => {
              const chg=q.regularMarketChangePercent, vol=q.regularMarketVolume
              const avg=q.averageDailyVolume3Month||vol||1
              const sig=Math.abs(chg)>4?'Strong':Math.abs(chg)>2?'Moderate':`Vol ${(vol/avg).toFixed(1)}x`
              return (
                <tr key={q.symbol} onClick={()=>onAnalyze(q.symbol)}>
                  <td><strong>{q.symbol}</strong></td>
                  <td style={{fontFamily:'var(--font-mono)'}}>{fmtPrice(q.regularMarketPrice)}</td>
                  <td className={chgColor(chg)}>{fmtPct(chg)}</td>
                  <td style={{color:'var(--text-secondary)'}}>{fmtVol(vol)}</td>
                  <td><span className={`badge ${chgBadge(chg)}`}>{sig}</span></td>
                </tr>
              )
            })}
            {!listData.length && <tr><td colSpan={5} style={{textAlign:'center',color:'var(--text-tertiary)',padding:16}}><span className="spinner"/> Loading...</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Options flow ───────────────────────────────────────────────── */}
      <div className="g1">
        {/* Options flow */}
        <div className="card">
          <div className="panel-hd">
            <span className="panel-title">
              Options flow
              <span style={{fontSize:10,color:'var(--text-tertiary)',marginLeft:6}}>{optSyms.length} tickers</span>
            </span>
            <div className="panel-actions">
              <button className={`btn ${showManage?'btn-primary':''}`} onClick={()=>setShowManage(p=>!p)}>
                {showManage?'✕ Close':'＋ Manage'}
              </button>
              <button className="btn btn-icon" onClick={loadOptions}>{loadOpt?<span className="spinner"/>:'↻'}</button>
            </div>
          </div>

          {/* Manage panel */}
          {showManage && (
            <div style={{background:'var(--bg-secondary)',borderRadius:'var(--r-md)',padding:'10px 12px',marginBottom:10,border:'0.5px solid var(--border-subtle)'}}>
              <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8}}>
                <input value={optInput} onChange={e=>setOptInput(e.target.value.toUpperCase())}
                  onKeyDown={e=>e.key==='Enter'&&addOptTicker()} placeholder="Add ticker" style={{flex:1,maxWidth:160}}/>
                <button className="btn btn-primary" onClick={addOptTicker}>Add</button>
                <button className="btn" style={{fontSize:10}} onClick={()=>saveOptSyms(DEFAULT_OPT_SYMS)}>Reset defaults</button>
              </div>
              <div style={{fontSize:10,color:'var(--text-tertiary)',marginBottom:5}}>Quick-add category</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                {OPT_CATEGORIES.map(cat=>{
                  const all=cat.syms.every(s=>optSyms.includes(s))
                  return (
                    <button key={cat.label} style={{fontSize:10,padding:'2px 8px',border:'0.5px solid var(--border-subtle)',borderRadius:20,cursor:'pointer',
                      background:all?'var(--bg-tertiary)':'transparent',color:all?'var(--text-primary)':'var(--text-secondary)'}}
                      onClick={()=>all?saveOptSyms(optSyms.filter(s=>!cat.syms.includes(s))):saveOptSyms([...new Set([...optSyms,...cat.syms])])}>
                      {all?'✓ ':'+  '}{cat.label}
                    </button>
                  )
                })}
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4,maxHeight:60,overflowY:'auto'}}>
                {optSyms.map(sym=>(
                  <span key={sym} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:20,fontSize:10,border:'0.5px solid var(--border-default)',background:'var(--bg-primary)'}}>
                    {sym}
                    <span onClick={()=>removeOptTicker(sym)} style={{cursor:'pointer',color:'var(--text-tertiary)',fontSize:10}}>✕</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Category filter */}
          <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
            {['All',...OPT_CATEGORIES.map(c=>c.label)].map(f=>(
              <button key={f} style={{fontSize:10,padding:'2px 8px',border:'0.5px solid var(--border-subtle)',borderRadius:20,cursor:'pointer',
                background:optFilter===f?'var(--bg-tertiary)':'transparent',color:optFilter===f?'var(--text-primary)':'var(--text-secondary)'}}
                onClick={()=>setOptFilter(f)}>
                {f}
              </button>
            ))}
          </div>

          {/* Options table — chain detail expands inline under each row */}
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:'12%'}}>Ticker</th>
                <th style={{width:'16%'}}>Price</th>
                <th style={{width:'10%'}}>Chg%</th>
                <th style={{width:'13%'}}>P/C ratio</th>
                <th style={{width:'11%'}}>IV rank</th>
                <th style={{width:'17%'}}>OI signal</th>
                <th style={{width:'11%'}}>Bias</th>
                <th style={{width:'10%'}}>Chain</th>
              </tr>
            </thead>
            <tbody>
              {filteredSyms.length === 0 && (
                <tr><td colSpan={8} style={{textAlign:'center',color:'var(--text-tertiary)',padding:16}}>No tickers — click Manage to add.</td></tr>
              )}
              {filteredSyms.map(sym => {
                const q      = optQ[sym]
                const od     = optData[sym] || { pc: 1.0, ivr: 50, bull: false }
                const p      = q?.regularMarketPrice
                const chg    = q?.regularMarketChangePercent
                const isOpen = chainSym === sym
                const flow   = flowData[sym]

                // Use real flow P/C ratio — od.pc is fake seeded data, only for fallback
                const pc       = flow?.pcVolumeRatio ?? null
                const hasReal  = pc != null
                const pcColor  = !hasReal ? 'var(--text-tertiary)'
                  : pc < 0.7 ? 'var(--green-text)' : pc > 1.0 ? 'var(--red-text)' : 'var(--amber-text)'
                const ivrColor = od.ivr > 70 ? 'var(--red-text)' : od.ivr > 50 ? 'var(--amber-text)' : 'var(--text-secondary)'
                const oiSig    = !hasReal ? '— open chain to load'
                  : pc < 0.6 ? '↑↑ Heavy calls' : pc < 0.8 ? '↑ Calls rising'
                  : pc < 1.0 ? '→ Neutral'       : pc < 1.3 ? '↓ Puts rising' : '↓↓ Heavy puts'
                const oiColor  = !hasReal ? 'var(--text-tertiary)'
                  : pc < 0.8 ? 'var(--green-text)' : pc > 1.0 ? 'var(--red-text)' : 'var(--text-secondary)'

                return (
                  <Fragment key={sym}>
                    {/* ── Ticker row ── */}
                    <tr
                      style={{ background: isOpen ? 'var(--bg-hover)' : undefined, cursor: 'pointer' }}
                      onClick={() => onAnalyze(sym)}
                    >
                      <td><strong style={{color: isOpen ? 'var(--blue)' : undefined}}>{sym}</strong></td>
                      <td style={{fontFamily:'var(--font-mono)'}}>
                        {p ? fmtPrice(p) : <span className="skeleton" style={{width:42,height:11,display:'inline-block',borderRadius:3}}/>}
                      </td>
                      <td className={chgColor(chg)} style={{fontFamily:'var(--font-mono)',fontSize:10}}>
                        {chg != null ? fmtPct(chg) : '—'}
                      </td>
                      <td style={{fontFamily:'var(--font-mono)',color:pcColor,fontWeight:500}}>
                        {hasReal ? pc.toFixed(2) : <span style={{color:'var(--text-tertiary)',fontSize:9}}>—</span>}
                      </td>
                      <td style={{color:ivrColor,fontWeight:500}}>{od.ivr}%</td>
                      <td style={{fontSize:10,color:oiColor}}>
                        {flow ? (() => {
                          const total   = (flow.callPremium||0) + (flow.putPremium||0)
                          const callPct = total > 0 ? flow.callPremium/total*100 : 50
                          return (
                            <div style={{display:'flex',flexDirection:'column',gap:2}}>
                              <div style={{fontSize:9,color:'var(--text-tertiary)'}}>
                                {flow.bias==='CALL'?'↑ Call dom.':flow.bias==='PUT'?'↓ Put dom.':'→ Neutral'}
                              </div>
                              <div style={{height:4,borderRadius:2,background:'var(--bg-tertiary)',overflow:'hidden',display:'flex',width:80}}>
                                <div style={{width:`${callPct}%`,background:'var(--green)',borderRadius:'2px 0 0 2px'}}/>
                                <div style={{flex:1,background:'var(--red)',borderRadius:'0 2px 2px 0'}}/>
                              </div>
                            </div>
                          )
                        })() : <span>{oiSig}</span>}
                      </td>
                      <td>
                        {hasReal ? (
                          <span className={`badge ${flow.bias==='CALL'?'badge-up':flow.bias==='PUT'?'badge-dn':'badge-warn'}`}>
                            {flow.bias==='CALL'?'↑ Bull':flow.bias==='PUT'?'↓ Bear':'→ Neut'}
                          </span>
                        ) : (
                          <span style={{fontSize:9,color:'var(--text-tertiary)'}}>—</span>
                        )}
                      </td>
                      <td onClick={e=>e.stopPropagation()} style={{display:'flex',gap:3}}>
                        <button
                          className={`btn ${isOpen?'btn-primary':''}`}
                          style={{fontSize:9,padding:'2px 6px'}}
                          onClick={()=>{ openChain(sym, p); if(!flow) loadFlow(sym) }}
                        >{isOpen?'▲ Close':'▼ Chain'}</button>
                        <button
                          className={`btn ${flow?'btn-success':''}`}
                          title="Load real flow from DB"
                          style={{fontSize:9,padding:'2px 6px'}}
                          onClick={()=>loadFlow(sym)}
                        >⚡</button>
                      </td>
                    </tr>

                    {/* ── Inline chain detail — directly under this row ── */}
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{padding:'0 0 6px 0', background:'var(--bg-secondary)'}}>
                          <OptionsDetail
                            key={chainSym}
                            sym={chainSym}
                            price={chainPrice}
                            closes={[]}
                            onClose={()=>setChainSym(null)}
                            refreshKey={chainTick}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>

          <div style={{marginTop:6,display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text-tertiary)'}}>
            <span>{filteredSyms.length} of {optSyms.length} tickers · P/C &lt; 0.7 bullish · &gt; 1.0 bearish</span>
            <span>Click row → Analyzer · ▼ Chain → options detail · ⚡ → load real flow</span>
          </div>
        </div>
      </div>

      {/* ── Earnings ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">Earnings — next 5 weeks</span>
          <div className="panel-actions">
            {loadEarn && <span className="spinner" />}
            <span style={{fontSize:10,color:'var(--text-tertiary)'}}>{earnData.length} upcoming</span>
            <button className="btn btn-icon" onClick={loadEarnings}>↻</button>
          </div>
        </div>
        {earnData.length === 0 && !loadEarn && (
          <div style={{textAlign:'center',padding:'16px',color:'var(--text-tertiary)',fontSize:11}}>
            <span className="spinner" style={{marginRight:6}}/>Loading earnings calendar...
          </div>
        )}
        {earnData.length > 0 && (
          <div style={{overflowX:'auto'}}>
            <table className="data-table" style={{tableLayout:'fixed',width:'100%'}}>
              <thead><tr>
                <th style={{width:'12%'}}>Ticker</th>
                <th style={{width:'14%'}}>Date</th>
                <th style={{width:'8%'}}>Days</th>
                <th style={{width:'9%'}}>When</th>
                <th style={{width:'14%'}}>EPS Est.</th>
                <th>Action</th>
              </tr></thead>
              <tbody>
                {earnData.map(r => {
                  const isT       = tracked.includes(r.symbol)
                  const inOptions = optSyms.includes(r.symbol)
                  const urgent    = r.daysAway <= 7
                  const soon      = r.daysAway <= 14
                  return (
                    <tr key={r.symbol} onClick={()=>onAnalyze(r.symbol)}>
                      <td><strong>{r.symbol}</strong></td>
                      <td style={{color:'var(--text-secondary)',fontSize:10}}>{r.date}</td>
                      <td>
                        <span style={{fontSize:9,padding:'1px 5px',borderRadius:6,
                          background: urgent?'var(--red-dim)':soon?'var(--amber-dim)':'var(--bg-tertiary)',
                          color: urgent?'var(--red-text)':soon?'var(--amber-text)':'var(--text-tertiary)',
                          fontWeight: urgent||soon ? 600 : 400,
                        }}>
                          {r.daysAway}d
                        </span>
                      </td>
                      <td>
                        <span style={{fontSize:9,padding:'1px 5px',border:'0.5px solid var(--border-default)',borderRadius:4,color:'var(--text-secondary)'}}>
                          {r.when}
                        </span>
                      </td>
                      <td style={{fontFamily:'var(--font-mono)',color:'var(--text-secondary)'}}>
                        {r.epsEstimate != null ? `$${r.epsEstimate}` : '—'}
                      </td>
                      <td style={{display:'flex',gap:3}} onClick={e=>e.stopPropagation()}>
                        <button className={`btn ${isT?'btn-success':''}`} style={{fontSize:9,padding:'2px 5px'}}
                          onClick={()=>toggleTrack(r.symbol)}>{isT?'✓':'Track'}</button>
                        <button
                          className={`btn ${inOptions?'btn-success':''}`}
                          style={{fontSize:9,padding:'2px 5px'}}
                          title={inOptions ? 'Already in options watchlist' : 'Add to options watchlist'}
                          onClick={()=>{ if(!inOptions) saveOptSyms([...optSyms, r.symbol]) }}
                        >{inOptions?'✓ Options':'＋ Options'}</button>
                        <button className="btn" style={{fontSize:9,padding:'2px 5px'}}
                          onClick={()=>onAnalyze(r.symbol)}>Analyze</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
