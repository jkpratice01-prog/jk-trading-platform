// Central client for our Python FastAPI backend.
// Dev: Vite proxies /api/* → localhost:8000 (VITE_API_URL is empty, proxy handles it)
// Prod: VITE_API_URL env var takes priority; falls back to hardcoded Fly.io URL
const IS_DEV   = import.meta.env.DEV
const API_BASE = IS_DEV
  ? ''
  : (import.meta.env.VITE_API_URL || 'https://jk-trading-backend.fly.dev')

async function apiFetch(path, options = {}) {
  const timeout = options._timeout ?? 15000
  delete options._timeout
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(timeout),
    ...options,
  })
  if (!res.ok) throw new Error(`Backend ${res.status}: ${path}`)
  return res.json()
}

export async function backendQuotes(symbols) {
  if (!symbols?.length) return {}
  const data = await apiFetch(`/api/quotes?symbols=${symbols.join(',')}`)
  // Normalize to the shape the rest of the app expects
  const result = {}
  for (const [sym, q] of Object.entries(data.data || {})) {
    result[sym] = {
      symbol:                     q.symbol,
      shortName:                  q.shortName,
      regularMarketPrice:         q.regularMarketPrice,
      regularMarketChange:        q.regularMarketChange,
      regularMarketChangePercent: q.regularMarketChangePercent,
      regularMarketVolume:        q.regularMarketVolume,
      regularMarketDayHigh:       q.regularMarketDayHigh,
      regularMarketDayLow:        q.regularMarketDayLow,
      regularMarketPreviousClose: q.regularMarketPreviousClose,
      marketCap:                  q.marketCap,
      trailingPE:                 q.trailingPE,
      bid:                        q.bid,
      ask:                        q.ask,
      averageDailyVolume3Month:   q.averageDailyVolume3Month,
      dataSource:                 q.dataSource,
    }
  }
  return result
}

export async function backendChart(symbol, days = 60, interval = '1d', startDate = null, endDate = null) {
  let qs = `days=${days}&interval=${interval}`
  if (startDate && endDate) qs += `&start_date=${startDate}&end_date=${endDate}`
  return apiFetch(`/api/chart/${symbol}?${qs}`)
}

export async function backendMovers(limit = 12) {
  return apiFetch(`/api/movers?limit=${limit}`)
}

export async function backendOptions(symbol, expiry = null) {
  const qs = expiry ? `?expiry=${expiry}` : ''
  return apiFetch(`/api/options/${symbol}${qs}`, { _timeout: 30000 })
}

export async function backendContractHistory(symbol, contractSymbol, expiry = null) {
  const qs = expiry ? `&expiry=${encodeURIComponent(expiry)}` : ''
  return apiFetch(`/api/options/${symbol}/contract/history?contract_symbol=${encodeURIComponent(contractSymbol)}${qs}`, { _timeout: 30000 })
}

export async function backendOptionsFlow(symbol) {
  return apiFetch(`/api/options/${symbol}/flow`, { _timeout: 25000 })
}

export async function backendOptionsFlowBatch(symbols) {
  if (!symbols?.length) return {}
  const data = await apiFetch(`/api/options/flow/batch?symbols=${symbols.join(',')}`, { _timeout: 25000 })
  return data?.flows || {}
}

export async function backendEarnings(symbols) {
  return apiFetch(`/api/earnings?symbols=${symbols.join(',')}`, { _timeout: 30000 })
}

export async function backendIVRank(symbol) {
  return apiFetch(`/api/options/${symbol}/ivrank`, { _timeout: 20000 })
}

export async function backendOIWall(symbol, expiry = null) {
  const qs = expiry ? `?expiry=${encodeURIComponent(expiry)}` : ''
  return apiFetch(`/api/options/${symbol}/oi-wall${qs}`)
}

export async function backendOIChanges(symbol, expiry = null) {
  const qs = expiry ? `?expiry=${encodeURIComponent(expiry)}` : ''
  return apiFetch(`/api/options/${symbol}/oi-changes${qs}`)
}

export async function backendVWAP(symbol) {
  return apiFetch(`/api/chart/${symbol}/vwap`)
}

export async function backendScan(symbols, minScore = 0) {
  return apiFetch('/api/scan', {
    method: 'POST',
    body: JSON.stringify({ symbols, min_score: minScore }),
  })
}

export async function backendScanCached(minScore = 0) {
  return apiFetch(`/api/scan/cached?min_score=${minScore}`)
}

export async function backendWatchlists() {
  return apiFetch('/api/watchlists')
}

export async function backendSaveWatchlist(name, symbols) {
  return apiFetch('/api/watchlists', {
    method: 'POST',
    body: JSON.stringify({ name, symbols }),
  })
}

export async function backendDeleteWatchlist(name) {
  return apiFetch(`/api/watchlists/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export async function isBackendAlive() {
  try {
    await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    return true
  } catch {
    return false
  }
}

// ── News ─────────────────────────────────────────────────────────────────────
export async function backendNews(symbol, limit = 8) {
  return apiFetch(`/api/news/${symbol}?limit=${limit}`)
}

// ── Pivot points ─────────────────────────────────────────────────────────────
export async function backendPivots(symbol) {
  return apiFetch(`/api/chart/${symbol}/pivots`)
}

// ── Market internals ──────────────────────────────────────────────────────────
export async function backendInternals() {
  return apiFetch('/api/internals')
}

// ── Pre-market ────────────────────────────────────────────────────────────────
export async function backendPremarket(limit = 30) {
  return apiFetch(`/api/premarket?limit=${limit}`)
}

// ── Unusual flow scanner ──────────────────────────────────────────────────────
export async function backendFlowScan(limit = 50) {
  return apiFetch(`/api/flow/scan?limit=${limit}`)
}

// ── Earnings IV ───────────────────────────────────────────────────────────────
export async function backendEarningsIV(symbol) {
  return apiFetch(`/api/earnings/${symbol}/iv`)
}

// ── Intraday scanner ──────────────────────────────────────────────────────────
export async function backendIntradayScan(limit = 25) {
  return apiFetch(`/api/intraday/scan?limit=${limit}`)
}

// ── Multi-timeframe ───────────────────────────────────────────────────────────
export async function backendMultiTimeframe(symbol) {
  return apiFetch(`/api/multi-timeframe/${symbol}`)
}

// ── Volatility skew ───────────────────────────────────────────────────────────
export async function backendVolSkew(symbol, expiry = null) {
  const qs = expiry ? `?expiry=${encodeURIComponent(expiry)}` : ''
  return apiFetch(`/api/options/${symbol}/skew${qs}`)
}

// ── Paper trading ─────────────────────────────────────────────────────────────
export async function backendTradingAccount() {
  return apiFetch('/api/trading/account')
}

export async function backendTradingPositions() {
  return apiFetch('/api/trading/positions')
}

export async function backendTradingOrders(status = 'all') {
  return apiFetch(`/api/trading/orders?status=${status}`)
}

export async function backendPlaceOrder(symbol, qty, side, orderType = 'market', limitPrice = null) {
  return apiFetch('/api/trading/orders', {
    method: 'POST',
    body: JSON.stringify({ symbol, qty, side, order_type: orderType, limit_price: limitPrice }),
  })
}

export async function backendCancelOrder(orderId) {
  return apiFetch(`/api/trading/orders/${orderId}`, { method: 'DELETE' })
}

export async function backendClosePosition(symbol) {
  return apiFetch(`/api/trading/positions/${symbol}`, { method: 'DELETE' })
}

// ── Trade journal ─────────────────────────────────────────────────────────────
export async function backendJournal(limit = 100) {
  return apiFetch(`/api/journal?limit=${limit}`)
}

export async function backendAddJournalEntry(entry) {
  return apiFetch('/api/journal', {
    method: 'POST',
    body: JSON.stringify(entry),
  })
}

export async function backendCloseJournalTrade(tradeId, exitPrice, exitTime = null) {
  const qs = exitTime ? `&exit_time=${encodeURIComponent(exitTime)}` : ''
  return apiFetch(`/api/journal/${tradeId}/close?exit_price=${exitPrice}${qs}`, { method: 'PUT' })
}

export async function backendDeleteJournalEntry(tradeId) {
  return apiFetch(`/api/journal/${tradeId}`, { method: 'DELETE' })
}

// ── Economic calendar ─────────────────────────────────────────────────────────
export async function backendCalendar(daysAhead = 60) {
  return apiFetch(`/api/calendar?days_ahead=${daysAhead}`, { _timeout: 90000 })
}

// ── Earnings history ──────────────────────────────────────────────────────────
export async function backendEarningsHistory(symbol, quarters = 8) {
  return apiFetch(`/api/stock/${symbol}/earnings-history?quarters=${quarters}`, { _timeout: 30000 })
}

// ── Deep stock info ───────────────────────────────────────────────────────────
export async function backendDeepInfo(symbol) {
  return apiFetch(`/api/stock/${symbol}/deep`, { _timeout: 30000 })
}

// ── Pre-earnings institutional flow ──────────────────────────────────────────
export async function backendEarningsFlow(daysAhead = 21) {
  return apiFetch(`/api/earnings-flow/scan?days_ahead=${daysAhead}`, { _timeout: 120000 })
}

// ── ATH Catalyst — single stock (used by Analyzer) ───────────────────────────
export async function backendStockCatalyst(symbol) {
  return apiFetch(`/api/stock/${symbol}/catalyst`, { _timeout: 30000 })
}

// ── ATH Catalyst Scanner ──────────────────────────────────────────────────────
export async function backendATHCatalyst(minScore = 2) {
  return apiFetch(`/api/scan/ath-catalyst?min_score=${minScore}`, { _timeout: 180000 })
}

export async function backendSectorMomentum() {
  return apiFetch('/api/scan/sector-momentum', { _timeout: 30000 })
}

export async function backendLowFloatMomentum() {
  return apiFetch('/api/scan/low-float-momentum', { _timeout: 120000 })
}

export async function backendThemeRockets(minGain = 20) {
  return apiFetch(`/api/scan/theme-rockets?min_gain=${minGain}`, { _timeout: 120000 })
}

// ── Options Decoder ───────────────────────────────────────────────────────────
export async function backendOptionsDecoder({ symbol, strike, optType, expiry }) {
  const p = new URLSearchParams({ symbol, strike, opt_type: optType, expiry })
  return apiFetch(`/api/options/decode?${p}`, { _timeout: 30000 })
}

// ── Institutional holders ─────────────────────────────────────────────────────
export async function backendInstitutionalHolders(symbol) {
  return apiFetch(`/api/institutions/${symbol}/holders`)
}

export async function backendMajorHolders(symbol) {
  return apiFetch(`/api/institutions/${symbol}/major`)
}

// ── Institutional flow tracker ────────────────────────────────────────────────
export async function backendInstitutionalFlow(limit = 50) {
  return apiFetch(`/api/institutional-flow?limit=${limit}`)
}

export async function backendInstitutionalFlowSymbol(symbol) {
  return apiFetch(`/api/institutional-flow/${symbol}`)
}

// ── Crypto hub ────────────────────────────────────────────────────────────────
export async function backendCryptoOverview() {
  return apiFetch('/api/crypto/overview')
}

export async function backendCryptoTop(limit = 50) {
  return apiFetch(`/api/crypto/top?limit=${limit}`, { _timeout: 30000 })
}

export async function backendCryptoInfo(symbol) {
  return apiFetch(`/api/crypto/${symbol}/info`, { _timeout: 20000 })
}

// ── Holdings tracker ──────────────────────────────────────────────────────────
export async function backendGetHoldings() {
  return apiFetch('/api/holdings', { _timeout: 15000 })
}

export async function backendAddHolding(data) {
  return apiFetch('/api/holdings', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function backendUpdateHolding(id, data) {
  return apiFetch(`/api/holdings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function backendDeleteHolding(id) {
  return apiFetch(`/api/holdings/${id}`, { method: 'DELETE' })
}

export async function backendHoldingDetail(symbol) {
  return apiFetch(`/api/holdings/${symbol}/detail`, { _timeout: 20000 })
}

export async function backendHoldingHistory(symbol, days = 30) {
  return apiFetch(`/api/holdings/${symbol}/history?days=${days}`)
}

export async function backendRefreshHoldings() {
  return apiFetch('/api/holdings/refresh', { method: 'POST', _timeout: 60000 })
}
