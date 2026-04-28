import { useState, useEffect } from 'react'
import { backendInternals } from '../api/backend.js'

const FEAR_COLOR = {
  'Extreme Fear': 'var(--red-text)',
  'Fear':         'var(--red-text)',
  'Elevated':     'var(--amber-text)',
  'Calm':         'var(--green-text)',
  'Complacency':  'var(--text-tertiary)',
}

const TERM_COLOR = {
  'contango':      'var(--green-text)',
  'flat':          'var(--text-secondary)',
  'flattening':    'var(--amber-text)',
  'backwardation': 'var(--red-text)',
}

const TERM_LABEL = {
  'contango':      'Contango (calm)',
  'flat':          'Flat',
  'flattening':    'Flattening',
  'backwardation': 'Backwardation (fear!)',
}

function Chg({ v }) {
  if (v == null) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
  const up = v >= 0
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: up ? 'var(--green-text)' : 'var(--red-text)' }}>
      {up ? '+' : ''}{v.toFixed(2)}%
    </span>
  )
}

function VixGauge({ level }) {
  // 0-50 scale, color bands
  const pct = Math.min(level / 50 * 100, 100)
  const color = level >= 35 ? 'var(--red)' : level >= 25 ? '#f97316' : level >= 18 ? 'var(--amber)' : 'var(--green)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .4s' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color }}>{level?.toFixed(1)}</span>
    </div>
  )
}

function IndexCard({ label, data, inverse = false }) {
  if (!data?.price) return null
  const up = inverse ? data.change <= 0 : data.change >= 0   // TLT: falling bonds = risk-on (green)
  return (
    <div style={{ textAlign: 'center', minWidth: 52 }}>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{data.price}</div>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: up ? 'var(--green-text)' : 'var(--red-text)' }}>
        {data.change >= 0 ? '+' : ''}{data.change?.toFixed(2)}%
      </div>
    </div>
  )
}

export default function MarketInternals({ refreshTick = 0 }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(true)

  async function load() {
    setLoading(true)
    try {
      const d = await backendInternals()
      setData(d)
    } catch { /* silent — non-critical */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [refreshTick])

  if (!data && !loading) return null

  const b  = data?.breadth || {}
  const ts = data?.termSignal
  const fear = data?.fearLabel

  return (
    <div className="card" style={{ padding: '10px 14px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? 10 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="panel-title" style={{ fontSize: 11 }}>Market Internals</span>
          {data && (
            <>
              {/* Fear gauge inline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <VixGauge level={data.vixLevel} />
                <span style={{ fontSize: 10, fontWeight: 600, color: FEAR_COLOR[fear] }}>{fear}</span>
              </div>
              {/* Term structure */}
              {ts && (
                <span style={{ fontSize: 10, color: TERM_COLOR[ts], fontWeight: 500 }}>
                  VIX3M−VIX {data.termSpread > 0 ? '+' : ''}{data.termSpread} · {TERM_LABEL[ts]}
                </span>
              )}
              {/* Risk mode */}
              <span style={{
                fontSize: 10, padding: '1px 8px', borderRadius: 20, fontWeight: 600,
                background: b.riskOn ? 'var(--green-dim)' : 'var(--red-dim)',
                color: b.riskOn ? 'var(--green-text)' : 'var(--red-text)',
              }}>
                {b.riskOn ? (b.riskConfirmed ? 'Risk-On ✓' : 'Risk-On') : 'Risk-Off'}
              </span>
            </>
          )}
        </div>
        <button onClick={() => setOpen(o => !o)} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
          {open ? '▲' : '▼'}
        </button>
      </div>

      {open && data && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* VIX block */}
          <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '8px 12px', minWidth: 140 }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Volatility</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: 'VIX (30d)',  val: data.vix?.price,   chg: data.vix?.change   },
                { label: 'VIX3M',      val: data.vix3m?.price, chg: data.vix3m?.change },
                { label: 'VVIX (vol-of-vol)', val: data.vvix?.price, chg: data.vvix?.change },
                { label: 'SKEW',       val: data.skew?.price,  chg: data.skew?.change  },
              ].map(({ label, val, chg }) => val ? (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{val}</span>
                    <Chg v={chg} />
                  </div>
                </div>
              ) : null)}
            </div>
          </div>

          {/* Indices block */}
          <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Index Breadth</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <IndexCard label="SPY"  data={data.spy} />
              <IndexCard label="QQQ"  data={data.qqq} />
              <IndexCard label="IWM"  data={data.iwm} />
              <IndexCard label="TLT"  data={data.tlt} inverse />
              <IndexCard label="GLD"  data={data.gld} />
            </div>
            {b.techVsSmallCap != null && (
              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>
                QQQ vs IWM spread:
                <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 4, color: b.techVsSmallCap > 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
                  {b.techVsSmallCap > 0 ? '+' : ''}{b.techVsSmallCap}%
                </span>
                <span style={{ marginLeft: 6, color: 'var(--text-tertiary)' }}>
                  {b.techVsSmallCap > 1 ? '(Tech leading)' : b.techVsSmallCap < -1 ? '(Small-cap leading)' : '(Equal weight)'}
                </span>
              </div>
            )}
          </div>

          {/* What it means */}
          <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '8px 12px', maxWidth: 260, fontSize: 10, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reading</div>
            {data.vixLevel >= 25
              ? <div style={{ color: 'var(--red-text)' }}>High VIX → options expensive. Sell premium or buy spreads, not naked longs.</div>
              : data.vixLevel <= 14
              ? <div style={{ color: 'var(--amber-text)' }}>Low VIX → options cheap. Long premium strategies (buy straddles/calls).</div>
              : <div>Moderate VIX. Use standard sizing.</div>
            }
            {ts === 'backwardation' && <div style={{ color: 'var(--red-text)', marginTop: 4 }}>VIX term inverted — near-term fear elevated. Reduce size or hedge.</div>}
            {ts === 'contango' && <div style={{ color: 'var(--green-text)', marginTop: 4 }}>VIX in contango — market pricing calm ahead. Theta strategies favor sellers.</div>}
            {!b.riskOn && <div style={{ color: 'var(--amber-text)', marginTop: 4 }}>Indices red — wait for confirmation before entering longs.</div>}
          </div>
        </div>
      )}

      {loading && !data && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
          <span className="spinner" style={{ marginRight: 4 }} />Loading internals...
        </div>
      )}
    </div>
  )
}
