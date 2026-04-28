// src/api/alphaVantage.js
// AlphaVantage API - Real-time stock market data
// Free tier: 5 calls/min, 500 calls/day
// Get key from: https://www.alphavantage.co/

const API_KEY = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY || 'demo'
const BASE_URL = 'https://www.alphavantage.co/query'

// Cache to avoid hitting rate limits
const cache = new Map()
const CACHE_TTL = 60000 // 1 minute

function cacheKey(fn, params) {
  return `${fn}:${JSON.stringify(params)}`
}

function getCached(key) {
  const item = cache.get(key)
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    return item.data
  }
  cache.delete(key)
  return null
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() })
}

async function fetchAlpha(params) {
  const url = new URL(BASE_URL)
  url.searchParams.append('apikey', API_KEY)
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v))

  const logPrefix = `%c[AlphaVantage-${params.function}]`
  const logStyle = 'color: #00ff00; font-weight: bold; background: #000; padding: 2px 6px; border-radius: 3px;'

  console.log(logPrefix, logStyle, `📤 Fetching ${params.function} for ${params.symbol || params.keywords}...`)

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000)
    })

    if (!res.ok) {
      console.error(logPrefix, logStyle, `❌ HTTP ${res.status}`)
      return null
    }

    const data = await res.json()

    // Check for API error messages
    if (data['Error Message']) {
      console.error(logPrefix, logStyle, `❌ API Error: ${data['Error Message']}`)
      return null
    }

    if (data['Note']) {
      // Rate limit exceeded
      console.warn(logPrefix, logStyle, `⚠️ Rate Limited: ${data['Note']}`)
      return null
    }

    console.log(logPrefix, logStyle, `✅ Success! Received data:`, data)
    return data
  } catch (err) {
    console.error(logPrefix, logStyle, `❌ Fetch error: ${err.message}`)
    return null
  }
}

/**
 * Get real-time quote for a symbol
 * Returns: { symbol, price, change, changePercent, updated }
 */
export async function getQuoteAlpha(symbol) {
  const key = cacheKey('quote', { symbol })
  const cached = getCached(key)
  if (cached) {
    console.log(`%c[Quote-${symbol}]`, 'color: #ffaa00; font-weight: bold;', '📦 Using cached data (1min TTL)')
    return cached
  }

  const data = await fetchAlpha({
    function: 'GLOBAL_QUOTE',
    symbol: symbol.toUpperCase(),
  })

  if (!data || !data['Global Quote']) {
    console.error(`%c[Quote-${symbol}]`, 'color: #ff0000; font-weight: bold;', '❌ No quote data returned')
    return null
  }

  const q = data['Global Quote']
  if (!q['05. price']) {
    console.error(`%c[Quote-${symbol}]`, 'color: #ff0000; font-weight: bold;', '❌ No price in response')
    return null
  }

  const result = {
    symbol: q['01. symbol'] || symbol.toUpperCase(),
    price: parseFloat(q['05. price']),
    change: parseFloat(q['09. change'] || 0),
    changePercent: parseFloat(q['10. change percent'] || 0),
    bid: parseFloat(q['06. bid'] || 0),
    ask: parseFloat(q['07. ask'] || 0),
    high: parseFloat(q['03. high'] || 0),
    low: parseFloat(q['04. low'] || 0),
    volume: parseInt(q['06. volume'] || 0),
    updated: new Date().toISOString(),
  }

  console.log(
    `%c[Quote-${symbol}]`,
    'color: #00ff00; font-weight: bold; background: #001100; padding: 2px 6px; border-radius: 3px;',
    `💹 REAL DATA: $${result.price} | Change: ${result.changePercent > 0 ? '+' : ''}${result.changePercent.toFixed(2)}% | Vol: ${result.volume}`,
    result
  )

  setCached(key, result)
  return result
}

/**
 * Get daily time series data
 * Returns: { symbol, data: [{date, open, high, low, close, volume}, ...] }
 */
export async function getDailySeriesAlpha(symbol, outputSize = 'compact') {
  const key = cacheKey('daily', { symbol, outputSize })
  const cached = getCached(key)
  if (cached) {
    console.log(`%c[Daily-${symbol}]`, 'color: #ffaa00; font-weight: bold;', '📦 Using cached data')
    return cached
  }

  const data = await fetchAlpha({
    function: 'TIME_SERIES_DAILY',
    symbol: symbol.toUpperCase(),
    outputsize: outputSize,
  })

  if (!data || !data['Time Series (Daily)']) {
    console.error(`%c[Daily-${symbol}]`, 'color: #ff0000; font-weight: bold;', '❌ No daily data')
    return null
  }

  const timeSeries = data['Time Series (Daily)']
  const dataPoints = Object.entries(timeSeries).map(([date, values]) => ({
    date,
    open: parseFloat(values['1. open']),
    high: parseFloat(values['2. high']),
    low: parseFloat(values['3. low']),
    close: parseFloat(values['4. close']),
    volume: parseInt(values['5. volume']),
  })).slice(0, 60)

  const result = {
    symbol: data['Meta Data']?.['2. Symbol'] || symbol.toUpperCase(),
    lastRefreshed: data['Meta Data']?.['3. Last Refreshed'],
    data: dataPoints,
  }

  console.log(
    `%c[Daily-${symbol}]`,
    'color: #00ff00; font-weight: bold; background: #001100; padding: 2px 6px; border-radius: 3px;',
    `📊 REAL CHART DATA: ${dataPoints.length} days | Latest: $${dataPoints[0]?.close} (${new Date(dataPoints[0]?.date).toLocaleDateString()})`,
    result
  )

  setCached(key, result)
  return result
}

/**
 * Get intraday time series (5min, 15min, 30min, 60min intervals)
 */
export async function getIntradayAlpha(symbol, interval = '5min') {
  const key = cacheKey('intraday', { symbol, interval })
  const cached = getCached(key)
  if (cached) return cached

  const data = await fetchAlpha({
    function: 'TIME_SERIES_INTRADAY',
    symbol: symbol.toUpperCase(),
    interval,
    outputsize: 'compact',
  })

  if (!data || !data[`Time Series (${interval})`]) {
    console.warn('[AlphaVantage] No intraday data for', symbol)
    return null
  }

  const key2 = `Time Series (${interval})`
  const timeSeries = data[key2]
  const result = {
    symbol: data['Meta Data']?.['2. Symbol'] || symbol.toUpperCase(),
    interval,
    data: Object.entries(timeSeries).map(([time, values]) => ({
      time,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume']),
    })),
  }

  setCached(key, result)
  return result
}

/**
 * Search for symbols matching a query
 */
export async function searchSymbolsAlpha(keywords) {
  const key = cacheKey('search', { keywords })
  const cached = getCached(key)
  if (cached) return cached

  const data = await fetchAlpha({
    function: 'SYMBOL_SEARCH',
    keywords: keywords.toUpperCase(),
  })

  if (!data || !data.bestMatches) return []

  const result = data.bestMatches.map(m => ({
    symbol: m['1. symbol'],
    name: m['2. name'],
    type: m['3. type'],
    region: m['4. region'],
    marketOpen: m['5. marketOpen'],
    marketClose: m['6. marketClose'],
    timezone: m['7. timezone'],
    currency: m['8. currency'],
  }))

  setCached(key, result)
  return result
}

/**
 * Get technical indicator - SMA (Simple Moving Average)
 */
export async function getSMAAlpha(symbol, interval = 'daily', period = 20, seriesType = 'close') {
  const key = cacheKey('sma', { symbol, interval, period, seriesType })
  const cached = getCached(key)
  if (cached) return cached

  const data = await fetchAlpha({
    function: 'SMA',
    symbol: symbol.toUpperCase(),
    interval,
    time_period: period,
    series_type: seriesType,
  })

  const techKey = 'Technical Analysis: SMA'
  if (!data || !data[techKey]) {
    console.warn('[AlphaVantage] No SMA data for', symbol)
    return null
  }

  const result = {
    symbol: data['Meta Data']?.['1: Symbol'] || symbol.toUpperCase(),
    period,
    data: Object.entries(data[techKey]).map(([date, values]) => ({
      date,
      sma: parseFloat(values.SMA),
    })).slice(0, 60),
  }

  setCached(key, result)
  return result
}

/**
 * Get technical indicator - RSI (Relative Strength Index)
 */
export async function getRSIAlpha(symbol, interval = 'daily', period = 14, seriesType = 'close') {
  const key = cacheKey('rsi', { symbol, interval, period, seriesType })
  const cached = getCached(key)
  if (cached) return cached

  const data = await fetchAlpha({
    function: 'RSI',
    symbol: symbol.toUpperCase(),
    interval,
    time_period: period,
    series_type: seriesType,
  })

  const techKey = 'Technical Analysis: RSI'
  if (!data || !data[techKey]) {
    console.warn('[AlphaVantage] No RSI data for', symbol)
    return null
  }

  const result = {
    symbol: data['Meta Data']?.['1: Symbol'] || symbol.toUpperCase(),
    period,
    data: Object.entries(data[techKey]).map(([date, values]) => ({
      date,
      rsi: parseFloat(values.RSI),
    })).slice(0, 60),
  }

  setCached(key, result)
  return result
}

/**
 * Get technical indicator - MACD (Moving Average Convergence Divergence)
 */
export async function getMACDAlpha(symbol, interval = 'daily', seriesType = 'close') {
  const key = cacheKey('macd', { symbol, interval, seriesType })
  const cached = getCached(key)
  if (cached) return cached

  const data = await fetchAlpha({
    function: 'MACD',
    symbol: symbol.toUpperCase(),
    interval,
    series_type: seriesType,
  })

  const techKey = 'Technical Analysis: MACD'
  if (!data || !data[techKey]) {
    console.warn('[AlphaVantage] No MACD data for', symbol)
    return null
  }

  const result = {
    symbol: data['Meta Data']?.['1: Symbol'] || symbol.toUpperCase(),
    data: Object.entries(data[techKey]).map(([date, values]) => ({
      date,
      macd: parseFloat(values.MACD),
      signal: parseFloat(values.MACD_Signal),
      histogram: parseFloat(values.MACD_Hist),
    })).slice(0, 60),
  }

  setCached(key, result)
  return result
}

/**
 * Get multiple quotes at once (batch)
 */
export async function getQuotesAlpha(symbols) {
  if (!symbols?.length) return {}

  // AlphaVantage doesn't support index symbols like ^VIX, ^GSPC, ^NDX
  const supportedSyms = symbols.filter(s => !s.startsWith('^'))
  if (!supportedSyms.length) return {}

  console.log(`%c[Batch-Quotes]`, 'color: #0099ff; font-weight: bold; background: #000033; padding: 2px 6px; border-radius: 3px;', `🔄 Fetching ${supportedSyms.length} quotes: ${supportedSyms.join(', ')}`)

  const result = {}

  // Create requests lazily inside the loop to actually enforce rate limits
  for (let i = 0; i < supportedSyms.length; i += 5) {
    const batch = supportedSyms.slice(i, i + 5)
    await Promise.all(batch.map(sym =>
      getQuoteAlpha(sym).then(quote => {
        if (quote) result[sym.toUpperCase()] = quote
      })
    ))
    if (i + 5 < supportedSyms.length) {
      console.log(`%c[Rate-Limit]`, 'color: #ffaa00;', `⏳ Waiting 13s before next batch (${i + 5}/${supportedSyms.length})...`)
      await new Promise(r => setTimeout(r, 13000))
    }
  }

  console.log(`%c[Batch-Quotes]`, 'color: #00ff00; font-weight: bold; background: #001100; padding: 2px 6px; border-radius: 3px;', `✅ Batch complete: ${Object.keys(result).length}/${supportedSyms.length} quotes retrieved`, result)

  return result
}

