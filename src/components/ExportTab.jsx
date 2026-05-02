import { useState, useEffect, useCallback } from 'react'
import {
  backendJournal, backendWatchlists,
  backendTradingPositions, backendTradingOrders, backendTradingAccount,
} from '../api/backend.js'

// ── CSV helpers ───────────────────────────────────────────────────────────────
function toCSV(rows) {
  if (!rows?.length) return ''
  const headers = Object.keys(rows[0])
  const escape  = v => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n')
}

function toJSON(data) {
  return JSON.stringify(data, null, 2)
}

function download(text, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = filename
  a.click()
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span>{icon}</span>{title}
      </div>
      {children}
    </div>
  )
}

function EmptyMsg({ msg }) {
  return <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '8px 0' }}>{msg}</div>
}

function PreviewTable({ rows, cols }) {
  if (!rows?.length) return <EmptyMsg msg="No data" />
  return (
    <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-tertiary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-tertiary)' }}>
              {cols.map(c => (
                <td key={c.key} style={{ padding: '4px 8px', whiteSpace: 'nowrap',
                  fontFamily: c.mono ? 'var(--font-mono)' : undefined,
                  color: c.color ? c.color(r[c.key]) : 'var(--text-primary)' }}>
                  {c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExportTab({ initialPlan }) {
  const [journal,   setJournal]   = useState([])
  const [watchlists,setWatchlists]= useState([])
  const [positions, setPositions] = useState([])
  const [orders,    setOrders]    = useState([])
  const [account,   setAccount]   = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [lastFetch, setLastFetch] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [j, w, p, o, acc] = await Promise.allSettled([
        backendJournal(500),
        backendWatchlists(),
        backendTradingPositions(),
        backendTradingOrders('all'),
        backendTradingAccount(),
      ])
      if (j.status === 'fulfilled')   setJournal(j.value?.trades || j.value || [])
      if (w.status === 'fulfilled')   setWatchlists(w.value || [])
      if (p.status === 'fulfilled')   setPositions(p.value?.positions || [])
      if (o.status === 'fulfilled')   setOrders(o.value?.orders || [])
      if (acc.status === 'fulfilled' && !acc.value?.error) setAccount(acc.value)
      setLastFetch(new Date().toLocaleTimeString())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Journal export ─────────────────────────────────────────────────────────
  const journalRows = journal.map(t => ({
    id:          t.id,
    symbol:      t.symbol,
    side:        t.side,
    qty:         t.qty,
    entry_price: t.entry_price,
    exit_price:  t.exit_price ?? '',
    pnl:         t.pnl != null ? t.pnl.toFixed(2) : '',
    pnl_pct:     t.pnl_pct != null ? t.pnl_pct.toFixed(2) : '',
    status:      t.status,
    entry_time:  t.entry_time,
    exit_time:   t.exit_time ?? '',
    notes:       t.notes ?? '',
    tags:        t.tags ?? '',
  }))

  const pnlColor = v => {
    const n = parseFloat(v)
    if (isNaN(n) || v === '') return 'var(--text-tertiary)'
    return n >= 0 ? 'var(--green-text)' : 'var(--red-text)'
  }

  // ── Watchlist export ───────────────────────────────────────────────────────
  const watchlistRows = watchlists.flatMap(w =>
    (w.symbols || []).map(sym => ({ watchlist: w.name, symbol: sym }))
  )

  // ── Positions export ───────────────────────────────────────────────────────
  const positionRows = positions.map(p => ({
    symbol:     p.symbol,
    qty:        p.qty,
    avg_entry:  p.avg_entry,
    current:    p.current_price,
    market_val: p.market_value,
    unrealized_pnl: p.unrealized_pnl != null ? p.unrealized_pnl.toFixed(2) : '',
    pnl_pct:    p.pnl_pct != null ? p.pnl_pct.toFixed(2) : '',
  }))

  // ── Orders export ──────────────────────────────────────────────────────────
  const orderRows = orders.map(o => ({
    id:       o.id,
    symbol:   o.symbol,
    side:     o.side,
    qty:      o.qty,
    type:     o.order_type,
    status:   o.status,
    price:    o.limit_price ?? 'market',
    filled:   o.filled_price ?? '',
    created:  o.created_at,
  }))

  // ── Analysis export (initialPlan) ──────────────────────────────────────────
  const analysisRows = initialPlan ? [{
    symbol:  initialPlan.ticker,
    price:   initialPlan.quote?.regularMarketPrice,
    change:  initialPlan.quote?.regularMarketChangePercent?.toFixed(2),
    market_cap: initialPlan.quote?.marketCap,
    volume:  initialPlan.quote?.regularMarketVolume,
    pe:      initialPlan.quote?.trailingPE?.toFixed(1),
    exported_at: new Date().toISOString(),
  }] : []

  const totalPnL = journal.reduce((s, t) => s + (t.pnl || 0), 0)
  const winners  = journal.filter(t => (t.pnl || 0) > 0).length
  const losers_c = journal.filter(t => (t.pnl || 0) < 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Export Data</span>
        <button className="btn" onClick={fetchAll} disabled={loading} style={{ fontSize: 11 }}>
          {loading ? <span className="spinner" /> : '↻ Refresh'}
        </button>
        {lastFetch && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Last fetched: {lastFetch}</span>
        )}
      </div>

      {/* ── Summary stats ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Journal Entries', value: journal.length },
          { label: 'Watchlists', value: watchlists.length },
          { label: 'Open Positions', value: positions.length },
          { label: 'Total Orders', value: orders.length },
          { label: 'Realized P&L', value: `${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`,
            color: totalPnL >= 0 ? 'var(--green-text)' : 'var(--red-text)' },
          { label: 'Win / Loss', value: `${winners} W  ${losers_c} L` },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '8px 14px', minWidth: 120 }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Trade Journal ──────────────────────────────────────────────────── */}
      <Section title="Trade Journal" icon="📓">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn btn-primary" style={{ fontSize: 11 }}
            onClick={() => download(toCSV(journalRows), `journal_${new Date().toISOString().slice(0,10)}.csv`)}
            disabled={!journalRows.length}>
            ↓ CSV
          </button>
          <button className="btn" style={{ fontSize: 11 }}
            onClick={() => download(toJSON(journal), `journal_${new Date().toISOString().slice(0,10)}.json`)}
            disabled={!journal.length}>
            ↓ JSON
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
            {journal.length} trades · Win rate: {journal.length ? Math.round(winners / journal.length * 100) : 0}%
          </span>
        </div>
        <PreviewTable rows={journalRows.slice(0, 50)} cols={[
          { key: 'symbol',      label: 'Symbol',   mono: true },
          { key: 'side',        label: 'Side',     fmt: v => v?.toUpperCase() },
          { key: 'qty',         label: 'Qty',      mono: true },
          { key: 'entry_price', label: 'Entry',    mono: true, fmt: v => v ? `$${v}` : '—' },
          { key: 'exit_price',  label: 'Exit',     mono: true, fmt: v => v ? `$${v}` : '—' },
          { key: 'pnl',         label: 'P&L',      mono: true, color: pnlColor, fmt: v => v !== '' ? `$${v}` : '—' },
          { key: 'pnl_pct',     label: 'P&L %',    mono: true, color: pnlColor, fmt: v => v !== '' ? `${v}%` : '—' },
          { key: 'status',      label: 'Status' },
          { key: 'entry_time',  label: 'Entry Time', fmt: v => v?.slice(0,16) },
        ]} />
      </Section>

      {/* ── Watchlists ─────────────────────────────────────────────────────── */}
      <Section title="Watchlists" icon="👁">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn btn-primary" style={{ fontSize: 11 }}
            onClick={() => download(toCSV(watchlistRows), `watchlists_${new Date().toISOString().slice(0,10)}.csv`)}
            disabled={!watchlistRows.length}>
            ↓ CSV
          </button>
          <button className="btn" style={{ fontSize: 11 }}
            onClick={() => download(toJSON(watchlists), `watchlists_${new Date().toISOString().slice(0,10)}.json`)}
            disabled={!watchlists.length}>
            ↓ JSON
          </button>
        </div>
        {watchlists.length === 0
          ? <EmptyMsg msg="No watchlists saved" />
          : watchlists.map(w => (
            <div key={w.name} style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{w.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                {(w.symbols || []).join(', ')}
              </span>
            </div>
          ))
        }
      </Section>

      {/* ── Open Positions ─────────────────────────────────────────────────── */}
      <Section title="Open Positions" icon="📊">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn btn-primary" style={{ fontSize: 11 }}
            onClick={() => download(toCSV(positionRows), `positions_${new Date().toISOString().slice(0,10)}.csv`)}
            disabled={!positionRows.length}>
            ↓ CSV
          </button>
          <button className="btn" style={{ fontSize: 11 }}
            onClick={() => download(toJSON(positions), `positions_${new Date().toISOString().slice(0,10)}.json`)}
            disabled={!positions.length}>
            ↓ JSON
          </button>
          {account && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
              Portfolio value: <strong>${account.portfolio_value?.toLocaleString()}</strong>
              &nbsp;·&nbsp; Cash: <strong>${account.cash?.toLocaleString()}</strong>
            </span>
          )}
        </div>
        <PreviewTable rows={positionRows} cols={[
          { key: 'symbol',         label: 'Symbol',    mono: true },
          { key: 'qty',            label: 'Qty',       mono: true },
          { key: 'avg_entry',      label: 'Avg Entry', mono: true, fmt: v => v ? `$${v}` : '—' },
          { key: 'current',        label: 'Current',   mono: true, fmt: v => v ? `$${v}` : '—' },
          { key: 'market_val',     label: 'Mkt Value', mono: true, fmt: v => v ? `$${parseFloat(v).toFixed(2)}` : '—' },
          { key: 'unrealized_pnl', label: 'Unreal. P&L', mono: true, color: pnlColor, fmt: v => v !== '' ? `$${v}` : '—' },
          { key: 'pnl_pct',        label: 'P&L %',     mono: true, color: pnlColor, fmt: v => v !== '' ? `${v}%` : '—' },
        ]} />
      </Section>

      {/* ── Order History ──────────────────────────────────────────────────── */}
      <Section title="Order History" icon="📋">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn btn-primary" style={{ fontSize: 11 }}
            onClick={() => download(toCSV(orderRows), `orders_${new Date().toISOString().slice(0,10)}.csv`)}
            disabled={!orderRows.length}>
            ↓ CSV
          </button>
          <button className="btn" style={{ fontSize: 11 }}
            onClick={() => download(toJSON(orders), `orders_${new Date().toISOString().slice(0,10)}.json`)}
            disabled={!orders.length}>
            ↓ JSON
          </button>
        </div>
        <PreviewTable rows={orderRows.slice(0, 50)} cols={[
          { key: 'symbol',  label: 'Symbol', mono: true },
          { key: 'side',    label: 'Side',   fmt: v => v?.toUpperCase() },
          { key: 'qty',     label: 'Qty',    mono: true },
          { key: 'type',    label: 'Type' },
          { key: 'price',   label: 'Price',  mono: true, fmt: v => v === 'market' ? 'MKT' : `$${v}` },
          { key: 'filled',  label: 'Filled', mono: true, fmt: v => v ? `$${v}` : '—' },
          { key: 'status',  label: 'Status' },
          { key: 'created', label: 'Created', fmt: v => v?.slice(0,16) },
        ]} />
      </Section>

      {/* ── Stock Analysis ─────────────────────────────────────────────────── */}
      <Section title="Last Stock Analysis" icon="🔍">
        {!initialPlan
          ? <EmptyMsg msg="Analyze a stock in the Analyzer tab first, then return here to export it." />
          : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button className="btn btn-primary" style={{ fontSize: 11 }}
                  onClick={() => download(toCSV(analysisRows), `analysis_${initialPlan.ticker}_${new Date().toISOString().slice(0,10)}.csv`)}>
                  ↓ CSV
                </button>
                <button className="btn" style={{ fontSize: 11 }}
                  onClick={() => download(toJSON(initialPlan), `analysis_${initialPlan.ticker}_${new Date().toISOString().slice(0,10)}.json`)}>
                  ↓ JSON (full)
                </button>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                  {initialPlan.ticker} · ${initialPlan.quote?.regularMarketPrice?.toFixed(2)}
                </span>
              </div>
              <PreviewTable rows={analysisRows} cols={[
                { key: 'symbol',     label: 'Symbol' },
                { key: 'price',      label: 'Price',  mono: true, fmt: v => v ? `$${v}` : '—' },
                { key: 'change',     label: 'Chg %',  mono: true, fmt: v => v ? `${v}%` : '—' },
                { key: 'market_cap', label: 'MCap',   mono: true, fmt: v => v ? `$${(v/1e9).toFixed(1)}B` : '—' },
                { key: 'pe',         label: 'P/E',    mono: true },
              ]} />
            </>
          )
        }
      </Section>

      {/* ── Full dump ──────────────────────────────────────────────────────── */}
      <Section title="Full Data Dump" icon="💾">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ fontSize: 11 }}
            onClick={() => download(toJSON({ journal, watchlists, positions, orders, account, exportedAt: new Date().toISOString() }),
              `full_export_${new Date().toISOString().slice(0,10)}.json`)}>
            ↓ Export Everything (JSON)
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
            Journal + Watchlists + Positions + Orders in one file
          </span>
        </div>
      </Section>

    </div>
  )
}