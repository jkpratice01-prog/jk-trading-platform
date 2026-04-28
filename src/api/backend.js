// Central client for our Python FastAPI backend.
// All calls use relative /api/* paths (proxied by Vite to localhost:8000).

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(15000),   // 15s max — prevents infinite loading
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

export async function backendChart(symbol, days = 60, interval = '1d') {
  return apiFetch(`/api/chart/${symbol}?days=${days}&interval=${interval}`)
}

export async function backendMovers(limit = 12) {
  return apiFetch(`/api/movers?limit=${limit}`)
}

export async function backendOptions(symbol, expiry = null) {
  const qs = expiry ? `?expiry=${expiry}` : ''
  return apiFetch(`/api/options/${symbol}${qs}`)
}

export async function backendContractHistory(symbol, contractSymbol, expiry = null) {
  const qs = expiry ? `&expiry=${encodeURIComponent(expiry)}` : ''
  return apiFetch(`/api/options/${symbol}/contract/history?contract_symbol=${encodeURIComponent(contractSymbol)}${qs}`)
}

export async function backendOptionsFlow(symbol) {
  return apiFetch(`/api/options/${symbol}/flow`)
}

export async function backendOptionsFlowBatch(symbols) {
  if (!symbols?.length) return {}
  const data = await apiFetch(`/api/options/flow/batch?symbols=${symbols.join(',')}`)
  return data?.flows || {}
}

export async function backendEarnings(symbols) {
  return apiFetch(`/api/earnings?symbols=${symbols.join(',')}`)
}

export async function backendIVRank(symbol) {
  return apiFetch(`/api/options/${symbol}/ivrank`)
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
