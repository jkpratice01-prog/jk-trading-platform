// Options chains — Python backend primary (yfinance real data), no fallback.
import { backendOptions } from './backend.js'

export async function getOptionsChain(symbol, price = null, closes = []) {
  try {
    const chain = await backendOptions(symbol)
    if (chain?.calls?.length) return chain
  } catch {}
  return null
}

export async function getOptionsChainForExpiry(symbol, expiry) {
  try {
    return await backendOptions(symbol, expiry)
  } catch {}
  return null
}

// Black-Scholes synthetic kept as emergency fallback only
function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x >= 0 ? 1 - p : p
}

function bsPrice(S, K, T, r, sigma, type) {
  if (T <= 0 || sigma <= 0) return Math.max(0, type === 'call' ? S - K : K - S)
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  return type === 'call'
    ? S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    : K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1)
}

function seededRand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

export function buildSyntheticChain(symbol, price, closes = []) {
  const valid = closes.filter(Boolean)
  let hv = 0.30
  if (valid.length >= 5) {
    const rets = valid.slice(1).map((c, i) => Math.log(c / valid[i]))
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)
    hv = Math.sqrt(variance * 252)
  }
  const iv  = Math.max(0.10, hv * 1.12)
  const r   = 0.05
  const rawStep = price < 50 ? 2.5 : price < 100 ? 5 : price < 500 ? 10 : 25
  const lo = Math.floor(price * 0.78 / rawStep) * rawStep
  const hi = Math.ceil(price  * 1.22 / rawStep) * rawStep
  const strikes = []
  for (let s = lo; s <= hi + 0.001; s = +(s + rawStep).toFixed(4)) strikes.push(+s.toFixed(2))

  const start = new Date()
  const dates = []
  for (let w = 0; w < 8; w++) {
    const d = new Date(start)
    const daysUntilFri = (5 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + daysUntilFri + w * 7)
    dates.push({ ts: Math.floor(d.getTime() / 1000), label: d.toISOString().slice(0, 10) })
  }
  const seed = Math.floor(Date.now() / 60000)
  const T    = Math.max(0.02, (dates[2].ts - Date.now() / 1000) / (365 * 86400))

  function makeContract(strike, type, idx) {
    const lp  = Math.max(0.01, bsPrice(price, strike, T, r, iv, type))
    const atmProx = Math.abs(strike - price) / price
    const baseOI  = Math.round(200 + seededRand(seed + idx) * 4000)
    const oi  = baseOI + (atmProx < 0.03 ? 8000 : atmProx < 0.06 ? 3000 : 0)
    const vol = Math.round(oi * (0.15 + seededRand(seed + idx + 200) * 0.75))
    return {
      contractSymbol: `${symbol}${strike}${type === 'call' ? 'C' : 'P'}`,
      strike, expiration: dates[2].ts, expirationLabel: dates[2].label,
      lastPrice: +lp.toFixed(2), bid: +Math.max(0.01, lp - 0.04).toFixed(2),
      ask: +(lp + 0.04).toFixed(2), volume: vol, openInterest: oi,
      impliedVolatility: iv, inTheMoney: type === 'call' ? strike < price : strike > price, type,
    }
  }

  return {
    symbol, source: 'synthetic', sourceLabel: 'Estimated (Black-Scholes)',
    expirationDates: dates.map(d => d.ts), expirationLabels: dates.map(d => d.label),
    strikes, calls: strikes.map((s, i) => makeContract(s, 'call', i)),
    puts: strikes.map((s, i) => makeContract(s, 'put', i + 1000)),
    quote: { regularMarketPrice: price }, hv: +(hv * 100).toFixed(1), iv: +(iv * 100).toFixed(1),
  }
}
