// src/utils/helpers.js

export function fmtPrice(val) {
  if (!val) return '—'
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPct(val) {
  if (val == null) return '—'
  const sign = val >= 0 ? '+' : ''
  return sign + val.toFixed(2) + '%'
}

export function fmtLarge(val) {
  if (!val) return '—'
  if (val >= 1e12) return (val / 1e12).toFixed(1) + 'T'
  if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B'
  if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M'
  if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K'
  return val.toFixed(0)
}

export function fmtVol(val) {
  if (!val) return '—'
  return fmtLarge(val)
}

export function chgColor(val) {
  if (val == null) return 'neu'
  return val > 0 ? 'up' : val < 0 ? 'dn' : 'neu'
}

export function chgBadge(val) {
  if (val == null) return 'badge-neu'
  return val > 0 ? 'badge-up' : val < 0 ? 'badge-dn' : 'badge-neu'
}

export function nowLabel() {
  const now = new Date()
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function daysFromNow(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
