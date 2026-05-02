import { useState, useEffect, useCallback } from 'react'
import {
  backendGetHoldings, backendAddHolding, backendUpdateHolding,
  backendDeleteHolding, backendHoldingDetail, backendHoldingHistory,
  backendRefreshHoldings,
} from '../api/backend.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSET_TYPES  = ['stock', 'etf', 'crypto', 'other']
const PROVIDERS    = ['Manual', 'Alpaca', 'Robinhood', 'Coinbase', 'IBKR', 'TD Ameritrade', 'Fidelity', 'Schwab', 'Other']

const EMPTY_FORM = {
  symbol: '', purchased_price: '', qty: '1', provider: 'Manual',
  asset_type: 'stock', purchased_date: '', notes: '',
}

const TYPE_COLORS = {
  stock:  { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  etf:    { bg: 'rgba(139,92,246,0.15)', color: '#a78bfa' },
  crypto: { bg: 'rgba(245,158,11,0.15)', color: 'var(--amber-text)' },
  other:  { bg: 'rgba(100,116,139,0.15)', color: 'var(--text-secondary)' },
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function Sparkline({ data, width = 280, height = 60 }) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">
          No price history yet
        </text>
      </svg>
    )
  }

  const prices = data.map(d => d.price).filter(p => p != null)
  if (prices.length < 2) return null

  const minP  = Math.min(...prices)
  const maxP  = Math.max(...prices)
  const range = maxP - minP || 1

  const pad    = { top: 8, bottom: 20, left: 4, right: 4 }
  const innerW = width  - pad.left - pad.right
  const innerH = height - pad.top  - pad.bottom

  const toX = (i) => pad.left + (i / (prices.length - 1)) * innerW
  const toY = (p) => pad.top  + (1 - (p - minP) / range) * innerH

  const points = prices.map((p, i) => `${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ')

  // Area polygon: line points + bottom-right + bottom-left
  const lastX = toX(prices.length - 1)
  const botY  = pad.top + innerH
  const areaPoints = [
    ...prices.map((p, i) => `${toX(i).toFixed(1)},${toY(p).toFixed(1)}`),
    `${lastX.toFixed(1)},${botY}`,
    `${pad.left},${botY}`,
  ].join(' ')

  const isGreen  = prices[prices.length - 1] >= prices[0]
  const lineColor = isGreen ? 'var(--green-text)' : 'var(--red-text)'
  const fillColor = isGreen ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'

  const fmtPrice = (p) => p >= 1000 ? `$${(p / 1000).toFixed(1)}k` : `$${p.toFixed(2)}`

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Area fill */}
      <polygon points={areaPoints} fill={fillColor} />
      {/* Line */}
      <polyline points={points} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* Min / max labels */}
      <text x={pad.left} y={height - 4} fontSize={9} fill="var(--text-tertiary)">{fmtPrice(minP)}</text>
      <text x={width - pad.right} y={height - 4} fontSize={9} fill="var(--text-tertiary)" textAnchor="end">{fmtPrice(maxP)}</text>
    </svg>
  )
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmt$  = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
const fmtMktCap = (v) => {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toLocaleString()}`
}

function PlColor({ value, children }) {
  const color = value == null ? 'var(--text-tertiary)'
              : value >= 0   ? 'var(--green-text)' : 'var(--red-text)'
  return <span style={{ color, fontFamily: 'var(--font-mono)' }}>{children}</span>
}

function DayPill({ pct }) {
  if (pct == null) return <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>—</span>
  const pos = pct >= 0
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
      padding: '1px 5px', borderRadius: 4,
      background: pos ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      color: pos ? 'var(--green-text)' : 'var(--red-text)',
    }}>
      {fmtPct(pct)}
    </span>
  )
}

function TypeBadge({ type }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.other
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
      background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {type}
    </span>
  )
}

function ProviderBadge({ provider }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 500, padding: '1px 5px', borderRadius: 3,
      background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
    }}>
      {provider || 'Manual'}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HoldingsTracker() {
  const [holdings,        setHoldings]        = useState([])
  const [loading,         setLoading]         = useState(false)
  const [refreshing,      setRefreshing]      = useState(false)
  const [expandedId,      setExpandedId]      = useState(null)
  const [expandedDetail,  setExpandedDetail]  = useState({})
  const [expandedHistory, setExpandedHistory] = useState([])
  const [detailLoading,   setDetailLoading]   = useState(false)
  const [showAddForm,     setShowAddForm]      = useState(false)
  const [editingId,       setEditingId]        = useState(null)
  const [sortBy,          setSortBy]           = useState('plPct')
  const [sortDir,         setSortDir]          = useState('desc')
  const [filterType,      setFilterType]       = useState('all')
  const [form,            setForm]             = useState(EMPTY_FORM)
  const [saving,          setSaving]           = useState(false)
  const [lastRefresh,     setLastRefresh]      = useState(null)
  const [error,           setError]            = useState(null)

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await backendGetHoldings()
      setHoldings(d.holdings || [])
    } catch {
      setError('Could not load holdings — is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Expand / collapse row ───────────────────────────────────────────────────

  useEffect(() => {
    if (expandedId == null) {
      setExpandedDetail({})
      setExpandedHistory([])
      return
    }
    const row = holdings.find(h => h.id === expandedId)
    if (!row) return

    setDetailLoading(true)
    setExpandedDetail({})
    setExpandedHistory([])

    Promise.all([
      backendHoldingDetail(row.symbol).catch(() => ({})),
      backendHoldingHistory(row.symbol, 30).catch(() => ({ history: [] })),
    ]).then(([detail, hist]) => {
      setExpandedDetail(detail || {})
      setExpandedHistory(hist.history || [])
    }).finally(() => setDetailLoading(false))
  }, [expandedId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh prices ──────────────────────────────────────────────────────────

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      await backendRefreshHoldings()
      setLastRefresh(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      await load()
    } catch {
      setError('Price refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  // ── Add / edit holding ──────────────────────────────────────────────────────

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowAddForm(true)
  }

  function openEdit(h) {
    setEditingId(h.id)
    setForm({
      symbol:          h.symbol,
      purchased_price: String(h.purchased_price),
      qty:             String(h.qty),
      provider:        h.provider || 'Manual',
      asset_type:      h.asset_type || 'stock',
      purchased_date:  h.purchased_date || '',
      notes:           h.notes || '',
    })
    setShowAddForm(true)
  }

  async function handleSave() {
    if (!form.symbol || !form.purchased_price) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        symbol:          form.symbol.toUpperCase().trim(),
        purchased_price: Number(form.purchased_price),
        qty:             Number(form.qty) || 1,
        provider:        form.provider,
        asset_type:      form.asset_type,
        purchased_date:  form.purchased_date || null,
        notes:           form.notes || null,
      }
      if (editingId != null) {
        await backendUpdateHolding(editingId, payload)
      } else {
        await backendAddHolding(payload)
      }
      setShowAddForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      await load()
    } catch (e) {
      setError('Failed to save holding')
    } finally {
      setSaving(false)
    }
  }

  function cancelForm() {
    setShowAddForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete(id) {
    if (!confirm('Remove this holding?')) return
    try {
      await backendDeleteHolding(id)
      if (expandedId === id) setExpandedId(null)
      await load()
    } catch {
      setError('Failed to delete holding')
    }
  }

  // ── Sort ────────────────────────────────────────────────────────────────────

  function handleSort(col) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  // ── Filter + sort ───────────────────────────────────────────────────────────

  const filtered = holdings.filter(h => filterType === 'all' || h.asset_type === filterType)

  const sorted = [...filtered].sort((a, b) => {
    const valA = a[sortBy] ?? (sortDir === 'asc' ? Infinity : -Infinity)
    const valB = b[sortBy] ?? (sortDir === 'asc' ? Infinity : -Infinity)
    const cmp  = typeof valA === 'string'
      ? valA.localeCompare(valB)
      : (valA < valB ? -1 : valA > valB ? 1 : 0)
    return sortDir === 'asc' ? cmp : -cmp
  })

  // ── Summary stats ───────────────────────────────────────────────────────────

  const withPrice   = holdings.filter(h => h.marketValue != null)
  const totalCost   = holdings.reduce((s, h) => s + (h.costBasis  || 0), 0)
  const totalMV     = withPrice.reduce((s, h) => s + (h.marketValue || 0), 0)
  const totalPL     = withPrice.reduce((s, h) => s + (h.plAbs     || 0), 0)
  const totalPLPct  = totalCost > 0 ? (totalPL / totalCost) * 100 : null
  const winners     = withPrice.filter(h => (h.plAbs || 0) > 0).length
  const losers      = withPrice.filter(h => (h.plAbs || 0) < 0).length

  // ── Render helpers ──────────────────────────────────────────────────────────

  function SortHeader({ col, label }) {
    const active = sortBy === col
    return (
      <th
        onClick={() => handleSort(col)}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        title={`Sort by ${label}`}
      >
        {label}
        {active && <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.7 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </th>
    )
  }

  const expandedRow = expandedId != null ? holdings.find(h => h.id === expandedId) : null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="panel-title" style={{ marginBottom: 2 }}>Holdings Tracker</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {lastRefresh && <>Last updated: {lastRefresh} · </>}
              {holdings.length} asset{holdings.length !== 1 ? 's' : ''}
              {totalMV > 0 && <> · Total value: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{fmt$(totalMV)}</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={handleRefresh}
              disabled={refreshing}
              style={{ fontSize: 11 }}
            >
              {refreshing ? '⏳ Refreshing…' : '↻ Refresh prices'}
            </button>
            <button
              className="btn btn-primary"
              onClick={openAdd}
              style={{ fontSize: 11 }}
            >
              + Add Holding
            </button>
          </div>
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)' }}>{error}</div>}
      </div>

      {/* Summary stats */}
      {holdings.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Cost Basis', value: fmt$(totalCost),  color: 'var(--text-primary)' },
              { label: 'Market Value',     value: fmt$(totalMV),    color: 'var(--text-primary)' },
              { label: 'Unrealized P&L',   value: fmt$(totalPL),    color: totalPL >= 0 ? 'var(--green-text)' : 'var(--red-text)' },
              { label: 'P&L %',            value: fmtPct(totalPLPct), color: (totalPLPct ?? 0) >= 0 ? 'var(--green-text)' : 'var(--red-text)' },
              { label: 'Winners',          value: String(winners),  color: 'var(--green-text)' },
              { label: 'Losers',           value: String(losers),   color: 'var(--red-text)' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter + sort bar */}
      <div className="card" style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', ...ASSET_TYPES].map(t => (
              <button
                key={t}
                className={`btn${filterType === t ? ' btn-primary' : ''}`}
                onClick={() => setFilterType(t)}
                style={{ fontSize: 10, padding: '3px 8px', textTransform: 'capitalize' }}
              >
                {t === 'all' ? 'All' : t.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Sort: <strong style={{ color: 'var(--text-secondary)' }}>{sortBy}</strong> {sortDir === 'asc' ? '▲' : '▼'}
          </div>
        </div>
      </div>

      {/* Add / edit form */}
      {showAddForm && (
        <div className="card">
          <div className="panel-title" style={{ marginBottom: 10 }}>
            {editingId != null ? 'Edit Holding' : 'Add Holding'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            {[
              { key: 'symbol',          label: 'Symbol',         type: 'text',   placeholder: 'AAPL', disabled: editingId != null },
              { key: 'purchased_price', label: 'Purchase Price', type: 'number', placeholder: '180.50' },
              { key: 'qty',             label: 'Quantity',       type: 'number', placeholder: '10' },
              { key: 'purchased_date',  label: 'Purchase Date',  type: 'date' },
            ].map(({ key, label, type, placeholder, disabled }) => (
              <label key={key} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {label}
                <input
                  type={type}
                  value={form[key]}
                  placeholder={placeholder}
                  disabled={disabled}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ fontSize: 11 }}
                />
              </label>
            ))}
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              Asset Type
              <select value={form.asset_type} onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))} style={{ fontSize: 11 }}>
                {ASSET_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              Provider / Broker
              <select value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} style={{ fontSize: 11 }}>
                {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
            Notes
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Strategy, thesis, reminders…"
              style={{ fontSize: 11, resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 11 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" onClick={cancelForm} style={{ fontSize: 11 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Main table */}
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)', fontSize: 12 }}>
          Loading holdings…
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>No holdings yet</div>
          <div style={{ fontSize: 11 }}>Click "+ Add Holding" to track your first position</div>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader col="symbol" label="Asset" />
                  <th>Provider</th>
                  <th>Type</th>
                  <SortHeader col="qty" label="Qty" />
                  <SortHeader col="purchased_price" label="Buy Price" />
                  <SortHeader col="current_price" label="Current" />
                  <th>Day %</th>
                  <SortHeader col="plAbs" label="P&L $" />
                  <SortHeader col="plPct" label="P&L %" />
                  <SortHeader col="marketValue" label="Value" />
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(h => (
                  <>
                    <tr
                      key={h.id}
                      style={{
                        background: expandedId === h.id ? 'var(--bg-secondary)' : undefined,
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Asset */}
                      <td>
                        <div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>
                            {h.symbol}
                          </span>
                        </div>
                        {h.name && (
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {h.name}
                          </div>
                        )}
                      </td>
                      {/* Provider */}
                      <td><ProviderBadge provider={h.provider} /></td>
                      {/* Type */}
                      <td><TypeBadge type={h.asset_type || 'stock'} /></td>
                      {/* Qty */}
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{h.qty}</td>
                      {/* Buy price */}
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{fmt$(h.purchased_price)}</td>
                      {/* Current price */}
                      <td>
                        {h.current_price == null ? (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }} title="No price yet — click Refresh">—</span>
                        ) : (
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 11,
                            color: (h.change_pct ?? 0) >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                          }}>
                            {fmt$(h.current_price)}
                          </span>
                        )}
                      </td>
                      {/* Day % */}
                      <td><DayPill pct={h.change_pct} /></td>
                      {/* P&L $ */}
                      <td>
                        <PlColor value={h.plAbs}>
                          {h.plAbs == null ? <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                            : `${h.plAbs >= 0 ? '+' : ''}${fmt$(h.plAbs)}`}
                        </PlColor>
                      </td>
                      {/* P&L % */}
                      <td>
                        <PlColor value={h.plPct}>
                          <strong>
                            {h.plPct == null ? <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>—</span>
                              : <>{h.plPct >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(h.plPct))}</>}
                          </strong>
                        </PlColor>
                      </td>
                      {/* Market value */}
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {h.marketValue == null ? <span style={{ color: 'var(--text-tertiary)' }}>—</span> : fmt$(h.marketValue)}
                      </td>
                      {/* Actions */}
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            className="btn"
                            style={{ fontSize: 9, padding: '2px 5px' }}
                            title={expandedId === h.id ? 'Collapse' : 'Expand detail'}
                            onClick={() => setExpandedId(id => id === h.id ? null : h.id)}
                          >
                            {expandedId === h.id ? '▼' : '▶'}
                          </button>
                          <button
                            className="btn"
                            style={{ fontSize: 9, padding: '2px 5px' }}
                            title="Edit"
                            onClick={() => openEdit(h)}
                          >
                            ✎
                          </button>
                          <button
                            className="btn"
                            style={{ fontSize: 9, padding: '2px 5px', color: 'var(--red-text)' }}
                            title="Delete"
                            onClick={() => handleDelete(h.id)}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail panel */}
                    {expandedId === h.id && (
                      <tr key={`${h.id}-detail`}>
                        <td colSpan={11} style={{ padding: 0, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
                          <ExpandedDetail
                            holding={h}
                            detail={expandedDetail}
                            history={expandedHistory}
                            loading={detailLoading}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>

              {/* Summary footer */}
              {sorted.length > 1 && (
                <tfoot>
                  <tr style={{ background: 'var(--bg-secondary)', fontWeight: 600 }}>
                    <td colSpan={3} style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: '6px 10px' }}>
                      {sorted.length} positions shown
                    </td>
                    <td />
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>—</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>—</td>
                    <td />
                    <td>
                      <PlColor value={totalPL}>
                        <strong>{totalPL >= 0 ? '+' : ''}{fmt$(totalPL)}</strong>
                      </PlColor>
                    </td>
                    <td>
                      <PlColor value={totalPLPct}>
                        <strong>{totalPLPct == null ? '—' : <>{(totalPLPct ?? 0) >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(totalPLPct ?? 0))}</>}</strong>
                      </PlColor>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>
                      {fmt$(totalMV)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Expanded detail panel ─────────────────────────────────────────────────────

function ExpandedDetail({ holding, detail, history, loading }) {
  const h = holding

  if (loading) {
    return (
      <div style={{ padding: '16px 20px', fontSize: 11, color: 'var(--text-tertiary)' }}>
        Loading detail…
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Day range + 52-week */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {h.day_high != null && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' }}>Day Range</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--red-text)' }}>L {fmt$(h.day_low)}</span>
              {' — '}
              <span style={{ color: 'var(--green-text)' }}>H {fmt$(h.day_high)}</span>
              {h.change_pct != null && (
                <span style={{ marginLeft: 8, color: (h.change_pct >= 0) ? 'var(--green-text)' : 'var(--red-text)' }}>
                  ({fmtPct(h.change_pct)})
                </span>
              )}
            </div>
          </div>
        )}
        {detail.week52High != null && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' }}>52-Week</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--red-text)' }}>L {fmt$(detail.week52Low)}</span>
              {' — '}
              <span style={{ color: 'var(--green-text)' }}>H {fmt$(detail.week52High)}</span>
            </div>
          </div>
        )}
        {detail.marketCap != null && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' }}>Market Cap</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{fmtMktCap(detail.marketCap)}</div>
          </div>
        )}
        {detail.beta != null && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' }}>Beta</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{Number(detail.beta).toFixed(2)}</div>
          </div>
        )}
        {detail.sector && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' }}>Sector</div>
            <div style={{ fontSize: 11 }}>{detail.sector}</div>
          </div>
        )}
        {detail.earningsDate && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' }}>Next Earnings</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--amber-text)' }}>{detail.earningsDate}</div>
          </div>
        )}
      </div>

      {/* Sparkline + cost basis summary */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>30-Day Price History</div>
          <Sparkline data={history} width={280} height={60} />
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' }}>Cost Basis</div>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{fmt$(h.costBasis)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' }}>Market Value</div>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{fmt$(h.marketValue)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' }}>Unrealized P&L</div>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: (h.plAbs ?? 0) >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
              {h.plAbs == null ? '—' : `${h.plAbs >= 0 ? '+' : ''}${fmt$(h.plAbs)} (${fmtPct(h.plPct)})`}
            </div>
          </div>
        </div>
      </div>

      {/* Business description */}
      {detail.description && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5, maxWidth: 640 }}>
          {detail.description}
        </div>
      )}

      {/* Notes */}
      {h.notes && (
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Note: {h.notes}
        </div>
      )}
    </div>
  )
}