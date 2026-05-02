import { useState, useEffect } from 'react'
import { backendCalendar } from '../api/backend.js'

const CAT_META = {
  FED:       { icon: '🏦', color: 'var(--blue)',       label: 'Federal Reserve' },
  INFLATION: { icon: '📊', color: 'var(--amber-text)', label: 'Inflation'       },
  JOBS:      { icon: '👷', color: 'var(--green-text)', label: 'Jobs'            },
  GDP:       { icon: '📈', color: 'var(--blue)',        label: 'GDP'             },
  CONSUMER:  { icon: '🛒', color: 'var(--text-secondary)', label: 'Consumer'    },
  EARNINGS:  { icon: '💰', color: 'var(--amber-text)', label: 'Earnings'        },
}

const IMPACT_COLOR = {
  HIGH: 'var(--red-text)',
  MED:  'var(--amber-text)',
  LOW:  'var(--text-tertiary)',
}

function DaysBadge({ days }) {
  if (days === 0) return <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: 'var(--red-dim)', color: 'var(--red-text)' }}>TODAY</span>
  if (days === 1) return <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: 'var(--amber-dim)', color: 'var(--amber-text)' }}>TOMORROW</span>
  return <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>in {days}d</span>
}

function EventRow({ ev, onEarningsClick }) {
  const cat  = CAT_META[ev.category] || CAT_META.FED
  const isEarnings = ev.category === 'EARNINGS'
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        borderRadius: 6, borderLeft: `2px solid ${ev.daysAway === 0 ? 'var(--red-text)' : cat.color}`,
        background: ev.daysAway === 0 ? 'var(--red-dim)' : 'var(--bg-tertiary)',
        cursor: isEarnings ? 'pointer' : 'default',
      }}
      onClick={() => isEarnings && onEarningsClick && onEarningsClick(ev.symbol)}
    >
      <span style={{ fontSize: 14 }}>{cat.icon}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isEarnings ? <><strong style={{ color: cat.color }}>{ev.symbol}</strong> Earnings</> : ev.event}
          {ev.epsEstimate != null && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>Est. ${ev.epsEstimate} EPS</span>}
        </div>
        {ev.note && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>{ev.note}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{ev.date}</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-secondary)', color: IMPACT_COLOR[ev.impact] || 'var(--text-tertiary)' }}>
          {ev.impact}
        </span>
        <DaysBadge days={ev.daysAway} />
      </div>
    </div>
  )
}

export default function EconomicCalendar({ onAnalyze }) {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [daysAhead, setDaysAhead] = useState(60)
  const [filter,    setFilter]    = useState('ALL')
  const [lastScan,  setLastScan]  = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const d = await backendCalendar(daysAhead)
      setData(d); setLastScan(new Date().toLocaleTimeString())
    } catch {
      setError('Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const events = (data?.events || []).filter(e => filter === 'ALL' || e.category === filter)
  const todayEvents = data?.todayEvents || []

  // Group events by date
  const grouped = {}
  for (const ev of events) {
    grouped[ev.date] = grouped[ev.date] || []
    grouped[ev.date].push(ev)
  }
  const sortedDates = Object.keys(grouped).sort()

  const cats = ['ALL', 'FED', 'INFLATION', 'JOBS', 'GDP', 'EARNINGS', 'CONSUMER']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">📅 Economic Calendar</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            FOMC · CPI · NFP · PCE · GDP · Earnings · {events.length} events
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
          High-impact macro events move the entire market regardless of stock fundamentals. Know what's coming before placing trades.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={load} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? 'Loading…' : '🔄 Refresh'}
          </button>
          <select value={daysAhead} onChange={e => { setDaysAhead(Number(e.target.value)) }}
            style={{ fontSize: 11, padding: '5px 8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}>
            <option value={30}>Next 30 days</option>
            <option value={60}>Next 60 days</option>
            <option value={90}>Next 90 days</option>
          </select>
          {cats.map(c => (
            <button key={c} className="btn" onClick={() => setFilter(c)}
              style={{ fontSize: 10, padding: '3px 10px', fontWeight: filter === c ? 700 : 400,
                color: filter === c ? (CAT_META[c]?.color || 'var(--text-primary)') : 'var(--text-secondary)',
                background: filter === c ? 'var(--bg-tertiary)' : 'transparent',
                border: filter === c ? '0.5px solid var(--border-subtle)' : 'none' }}>
              {CAT_META[c]?.icon} {c}
            </button>
          ))}
          {lastScan && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Updated {lastScan}</span>}
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 6 }}>{error}</div>}
      </div>

      {/* TODAY banner */}
      {todayEvents.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--red-text)', background: 'var(--red-dim)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red-text)', marginBottom: 8 }}>🔴 TODAY'S EVENTS — Trade with caution</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todayEvents.map((ev, i) => (
              <div key={i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{CAT_META[ev.category]?.icon}</span>
                <span>{ev.event || (ev.symbol + ' Earnings')}</span>
                <span style={{ fontSize: 10, color: 'var(--red-text)', fontWeight: 700 }}>{ev.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impact legend */}
      <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-tertiary)' }}>
        {[['HIGH', 'var(--red-text)', 'Major market mover'], ['MED', 'var(--amber-text)', 'Moderate impact'], ['LOW', 'var(--text-tertiary)', 'Low impact']].map(([label, color, desc]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <strong style={{ color }}>{label}</strong> — {desc}
          </span>
        ))}
      </div>

      {/* Events grouped by date */}
      {!loading && sortedDates.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
          No events found for selected filter and time range.
        </div>
      )}

      {sortedDates.map(dateStr => {
        const dayEvents = grouped[dateStr]
        const isToday   = dayEvents.some(e => e.daysAway === 0)
        const daysAway  = dayEvents[0]?.daysAway ?? 0
        return (
          <div key={dateStr}>
            <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? 'var(--red-text)' : 'var(--text-tertiary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
              {dateStr}
              {isToday && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'var(--red-dim)', color: 'var(--red-text)' }}>TODAY</span>}
              {!isToday && daysAway <= 7 && <span style={{ fontSize: 9, color: 'var(--amber-text)' }}>this week</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dayEvents.map((ev, i) => (
                <EventRow key={i} ev={ev} onEarningsClick={onAnalyze} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
