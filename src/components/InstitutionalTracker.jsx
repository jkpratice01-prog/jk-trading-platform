import { useState, useEffect } from 'react'
import { backendInstitutionalHolders, backendMajorHolders } from '../api/backend'

export default function InstitutionalTracker({ symbol: propSymbol }) {
  const [searchSymbol, setSearchSymbol] = useState(propSymbol || 'AAPL')
  const [holders, setHolders] = useState([])
  const [major, setMajor] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadData = async (sym) => {
    if (!sym) return
    try {
      setLoading(true)
      setError(null)
      const [holdersData, majorData] = await Promise.all([
        backendInstitutionalHolders(sym),
        backendMajorHolders(sym)
      ])
      setHolders(holdersData.holders || [])
      setMajor(majorData.breakdown || {})
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(searchSymbol)
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    const sym = searchSymbol.toUpperCase().trim()
    if (sym) {
      loadData(sym)
    }
  }

  if (error && !loading) return <div style={{ padding: '20px', color: 'var(--text-danger)' }}>Error: {error}</div>

  return (
    <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '8px', margin: '20px 0' }}>
      {/* Search box */}
      <form onSubmit={handleSearch} style={{ marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          value={searchSymbol}
          onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
          placeholder="Enter ticker symbol (e.g., AAPL, MSFT)"
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            border: '0.5px solid var(--border-subtle)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            flex: 1,
            maxWidth: '300px',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: '4px',
            border: 'none',
            background: 'var(--blue)',
            color: 'white',
            fontSize: '13px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Search'}
        </button>
      </form>

      <h3 style={{ color: 'var(--text-primary)', marginTop: 0 }}>Institutional Ownership for {searchSymbol}</h3>

      {loading && <div style={{ padding: '20px', color: 'var(--text-primary)' }}>Loading institutional data...</div>}

      {!loading && (
        <>
          <div style={{ marginBottom: '30px' }}>
            <h4 style={{ color: 'var(--text-primary)' }}>Major Holders Breakdown</h4>
            {Object.keys(major).length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No data available</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {Object.entries(major).map(([key, value]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', border: '0.5px solid var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{key}:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{typeof value === 'number' && value > 100 ? value.toLocaleString() : value}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 style={{ color: 'var(--text-primary)' }}>Institutional Holders ({holders.length})</h4>
            {holders.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No institutional holders data available</p>
            ) : (
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '15px', padding: '12px 15px', background: 'var(--bg-secondary)', fontWeight: 'bold', borderBottom: '0.5px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                  <span>Holder</span>
                  <span>Shares</span>
                  <span>% Held</span>
                  <span>Value ($M)</span>
                  <span>Date Reported</span>
                </div>
                {holders.slice(0, 20).map((holder, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '15px', padding: '10px 15px', borderBottom: '0.5px solid var(--border-subtle)', alignItems: 'center', color: 'var(--text-primary)' }}>
                    <span style={{ fontWeight: '500' }}>{holder.holder}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{holder.shares?.toLocaleString()}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{holder.pctHeld}%</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>${(holder.value / 1e6).toFixed(1)}M</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{holder.dateReported}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
