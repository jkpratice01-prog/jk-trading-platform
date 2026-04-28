// Market data — backend primary (Python/Alpaca+yfinance), direct fallback if backend down.
import { backendQuotes, backendChart, backendMovers } from './backend.js'

// Shared proxy for direct Yahoo fallback (kept minimal)
const PROXIES = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
]

async function yfFetch(url) {
  for (const proxy of PROXIES) {
    try {
      const res  = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const text = await res.text()
      if (!text?.trim()) continue
      let data = JSON.parse(text)
      if (data?.contents) try { data = JSON.parse(data.contents) } catch {}
      return data
    } catch {}
  }
  return null
}

async function getQuoteViaChart(symbol) {
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`
  const data = await yfFetch(url)
  const res  = data?.chart?.result?.[0]
  if (!res) return null
  const meta   = res.meta || {}
  const closes = res.indicators?.quote?.[0]?.close || []
  const cur    = meta.regularMarketPrice ?? closes.findLast(c => c != null)
  const prev   = meta.chartPreviousClose ?? meta.previousClose ?? closes.findLast((c, i) => c != null && i < closes.length - 1)
  return {
    symbol,
    shortName:                  meta.shortName || meta.longName || symbol,
    regularMarketPrice:         cur,
    regularMarketChange:        (cur && prev) ? cur - prev : 0,
    regularMarketChangePercent: (cur && prev) ? (cur - prev) / prev * 100 : 0,
    regularMarketPreviousClose: prev,
    regularMarketVolume:        meta.regularMarketVolume,
    dataSource: 'Yahoo Chart (direct)',
  }
}

export async function getQuotes(symbols) {
  if (!symbols?.length) return {}
  try {
    return await backendQuotes(symbols)
  } catch {
    // Backend unavailable — fall back to direct Yahoo chart API
    const result = {}
    await Promise.all(symbols.map(async s => {
      const q = await getQuoteViaChart(s)
      if (q) result[s.toUpperCase()] = { ...q, dataSource: 'Yahoo Chart (fallback)' }
    }))
    return result
  }
}

export async function getChart(symbol, days = 60, interval = '1d') {
  try {
    return await backendChart(symbol, days, interval)
  } catch {}

  // Direct Yahoo fallback
  const range = days <= 5 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : '1y'
  const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`
  const data  = await yfFetch(url)
  const res   = data?.chart?.result?.[0]
  if (!res) return null
  const ts = res.timestamp || []
  const q  = res.indicators?.quote?.[0] || {}
  return {
    symbol,
    timestamps: ts,
    labels:  ts.map(t => new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })),
    open:   q.open  || [],
    high:   q.high  || [],
    low:    q.low   || [],
    close:  q.close || [],
    volume: q.volume|| [],
    regularMarketPrice: res.meta?.regularMarketPrice,
    source: 'Yahoo Chart (fallback)',
  }
}

export async function getDayGainers(n = 12) {
  try {
    const data = await backendMovers(n)
    return data.gainers || []
  } catch { return [] }
}

export async function getDayLosers(n = 12) {
  try {
    const data = await backendMovers(n)
    return data.losers || []
  } catch { return [] }
}

export async function getNews(symbol) {
  // Prefer backend (yfinance server-side) — proxy-based direct fetch is unreliable
  try {
    const { backendNews } = await import('./backend.js')
    const data = await backendNews(symbol, 8)
    if (data?.news?.length) return data.news
  } catch {}
  // Fallback: direct Yahoo search via proxy
  const url  = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=6`
  const data = await yfFetch(url)
  return data?.news || []
}

export async function searchSymbol(query) {
  const url  = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8`
  const data = await yfFetch(url)
  return (data?.quotes || []).filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
}

export async function getScreener(scrId, count = 10) {
  // Kept for compatibility — movers now come from backend
  return []
}
export const getMostActive = () => getScreener('most_actives', 10)
