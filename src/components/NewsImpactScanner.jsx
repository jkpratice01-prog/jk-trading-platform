import { useState, useMemo } from 'react'

// ── Knowledge base ────────────────────────────────────────────────────────────
// Each theme: keywords to match, label, up/down movers with reason
const THEMES = [
  {
    id: 'war',
    keywords: ['war', 'conflict', 'military', 'attack', 'invasion', 'missile', 'geopolit', 'nato', 'strike', 'bomb', 'troops', 'sanction'],
    label: 'War / Geopolitical Conflict',
    icon: '🪖',
    up: [
      { sym: 'LMT',  name: 'Lockheed Martin',   sector: 'Defense',      reason: 'Weapons & fighter jets demand spikes' },
      { sym: 'RTX',  name: 'Raytheon',          sector: 'Defense',      reason: 'Missile systems, Patriot batteries' },
      { sym: 'NOC',  name: 'Northrop Grumman',  sector: 'Defense',      reason: 'Stealth aircraft, drones' },
      { sym: 'GD',   name: 'General Dynamics',  sector: 'Defense',      reason: 'Combat vehicles, submarines' },
      { sym: 'XOM',  name: 'ExxonMobil',        sector: 'Energy',       reason: 'Oil supply disruption fears' },
      { sym: 'CVX',  name: 'Chevron',           sector: 'Energy',       reason: 'Crude oil price spike' },
      { sym: 'GLD',  name: 'SPDR Gold',         sector: 'Safe Haven',   reason: 'Flight to safety asset' },
      { sym: 'USO',  name: 'US Oil Fund',       sector: 'Commodities',  reason: 'Oil supply/transit risk' },
    ],
    down: [
      { sym: 'AAL',  name: 'American Airlines', sector: 'Airlines',     reason: 'Fuel costs surge, travel fear' },
      { sym: 'DAL',  name: 'Delta Air Lines',   sector: 'Airlines',     reason: 'Airspace closures, demand drop' },
      { sym: 'UAL',  name: 'United Airlines',   sector: 'Airlines',     reason: 'Route disruptions' },
      { sym: 'AMZN', name: 'Amazon',            sector: 'Consumer',     reason: 'Supply chain disruption' },
      { sym: 'NKE',  name: 'Nike',              sector: 'Consumer',     reason: 'Manufacturing regions affected' },
    ],
    note: 'Defense stocks typically rally 5–15% in first days of conflict escalation. Oil spikes 10–20% on Middle East tensions.',
  },

  {
    id: 'oil_spike',
    keywords: ['oil', 'crude', 'opec', 'brent', 'wti', 'petroleum', 'energy spike', 'oil price'],
    label: 'Oil Price Spike',
    icon: '🛢️',
    up: [
      { sym: 'XOM',  name: 'ExxonMobil',        sector: 'Energy',       reason: 'Direct revenue from higher oil' },
      { sym: 'CVX',  name: 'Chevron',           sector: 'Energy',       reason: 'Upstream production profits' },
      { sym: 'OXY',  name: 'Occidental',        sector: 'Energy',       reason: 'High leverage to oil price' },
      { sym: 'COP',  name: 'ConocoPhillips',    sector: 'Energy',       reason: 'Pure-play E&P benefits most' },
      { sym: 'SLB',  name: 'Schlumberger',      sector: 'Oilfield Svcs',reason: 'Drilling activity increases' },
      { sym: 'HAL',  name: 'Halliburton',       sector: 'Oilfield Svcs',reason: 'More drill contracts' },
      { sym: 'DVN',  name: 'Devon Energy',      sector: 'Energy',       reason: 'Shale production upside' },
    ],
    down: [
      { sym: 'AAL',  name: 'American Airlines', sector: 'Airlines',     reason: 'Jet fuel = 25% of operating costs' },
      { sym: 'DAL',  name: 'Delta Air Lines',   sector: 'Airlines',     reason: 'Margin compression' },
      { sym: 'UPS',  name: 'UPS',               sector: 'Logistics',    reason: 'Fuel surcharges hurt margins' },
      { sym: 'FDX',  name: 'FedEx',             sector: 'Logistics',    reason: 'Delivery costs spike' },
      { sym: 'AMZN', name: 'Amazon',            sector: 'Consumer',     reason: 'Shipping & warehouse fuel' },
      { sym: 'COST', name: 'Costco',            sector: 'Retail',       reason: 'Transportation costs pass-through' },
    ],
    note: 'For every $10/barrel increase in WTI, airline earnings drop ~$1.5B annually. Energy sector outperforms by ~8% on average during oil spikes.',
  },

  {
    id: 'rate_hike',
    keywords: ['rate hike', 'fed hike', 'interest rate', 'hawkish', 'tighten', 'inflation fight', 'fomc hike', 'raise rate'],
    label: 'Fed Rate Hike / Hawkish Fed',
    icon: '📈',
    up: [
      { sym: 'JPM',  name: 'JPMorgan Chase',    sector: 'Banks',        reason: 'Net interest margin expands' },
      { sym: 'BAC',  name: 'Bank of America',   sector: 'Banks',        reason: 'Floating rate loans benefit' },
      { sym: 'GS',   name: 'Goldman Sachs',     sector: 'Banks',        reason: 'Bond trading volatility profits' },
      { sym: 'WFC',  name: 'Wells Fargo',       sector: 'Banks',        reason: 'Deposit/loan spread widens' },
      { sym: 'V',    name: 'Visa',              sector: 'Payments',     reason: 'Spending holds up early-cycle' },
      { sym: 'UNH',  name: 'UnitedHealth',      sector: 'Healthcare',   reason: 'Defensive, lower duration' },
    ],
    down: [
      { sym: 'ARKK', name: 'ARK Innovation',    sector: 'Growth/Tech',  reason: 'Long-duration assets crushed' },
      { sym: 'NVDA', name: 'Nvidia',            sector: 'Semis',        reason: 'High P/E multiple compressed' },
      { sym: 'TSLA', name: 'Tesla',             sector: 'EV/Growth',    reason: 'Rate-sensitive valuation' },
      { sym: 'AMZN', name: 'Amazon',            sector: 'Tech/Retail',  reason: 'DCF value compressed' },
      { sym: 'HOOD', name: 'Robinhood',         sector: 'Fintech',      reason: 'Retail trading volumes drop' },
      { sym: 'O',    name: 'Realty Income',     sector: 'REITs',        reason: 'Cap rates rise, valuations fall' },
      { sym: 'NEE',  name: 'NextEra Energy',    sector: 'Utilities',    reason: 'Dividend yield less attractive' },
    ],
    note: 'Growth stocks with no earnings are most sensitive. A 25bps hike typically compresses Nasdaq P/E by 1–2x. Banks outperform the first 2 hikes.',
  },

  {
    id: 'rate_cut',
    keywords: ['rate cut', 'fed cut', 'dovish', 'pivot', 'ease', 'lower rate', 'fomc cut', 'rate reduction'],
    label: 'Fed Rate Cut / Dovish Pivot',
    icon: '📉',
    up: [
      { sym: 'ARKK', name: 'ARK Innovation',    sector: 'Growth/Tech',  reason: 'Long-duration assets reprice up' },
      { sym: 'NVDA', name: 'Nvidia',            sector: 'Semis',        reason: 'High P/E multiples expand' },
      { sym: 'TSLA', name: 'Tesla',             sector: 'EV/Growth',    reason: 'Cheaper borrowing for buyers' },
      { sym: 'AMZN', name: 'Amazon',            sector: 'Tech',         reason: 'Growth valued higher' },
      { sym: 'O',    name: 'Realty Income',     sector: 'REITs',        reason: 'Lower rates boost cap rates' },
      { sym: 'NEE',  name: 'NextEra Energy',    sector: 'Utilities',    reason: 'Yield plays re-rate higher' },
      { sym: 'GLD',  name: 'SPDR Gold',         sector: 'Commodities',  reason: 'Real yield drops, gold rises' },
      { sym: 'MSTR', name: 'MicroStrategy',     sector: 'Crypto',       reason: 'Risk assets rally broadly' },
    ],
    down: [
      { sym: 'JPM',  name: 'JPMorgan Chase',    sector: 'Banks',        reason: 'NIM compression' },
      { sym: 'BAC',  name: 'Bank of America',   sector: 'Banks',        reason: 'Spread income falls' },
      { sym: 'WFC',  name: 'Wells Fargo',       sector: 'Banks',        reason: 'Deposit rate re-pricing' },
    ],
    note: 'First rate cut historically triggers a 10–15% rally in growth/tech. Real assets and crypto benefit from lower real yields.',
  },

  {
    id: 'recession',
    keywords: ['recession', 'gdp decline', 'downturn', 'economic slowdown', 'contraction', 'jobs loss', 'layoffs', 'depression'],
    label: 'Recession / Economic Slowdown',
    icon: '📊',
    up: [
      { sym: 'PG',   name: 'Procter & Gamble',  sector: 'Staples',      reason: 'Non-discretionary demand holds' },
      { sym: 'KO',   name: 'Coca-Cola',         sector: 'Staples',      reason: 'Beverages unaffected by cycles' },
      { sym: 'JNJ',  name: 'Johnson & Johnson', sector: 'Healthcare',   reason: 'People still need medicine' },
      { sym: 'WMT',  name: 'Walmart',           sector: 'Retail',       reason: 'Trade-down effect boosts traffic' },
      { sym: 'GLD',  name: 'SPDR Gold',         sector: 'Safe Haven',   reason: 'Flight to safety' },
      { sym: 'TLT',  name: 'T-Bond ETF',        sector: 'Bonds',        reason: 'Risk-off bond buying' },
      { sym: 'MCD',  name: "McDonald's",        sector: 'Food',         reason: 'Trade-down from restaurants' },
    ],
    down: [
      { sym: 'CAT',  name: 'Caterpillar',       sector: 'Industrials',  reason: 'Cap-ex spending freezes' },
      { sym: 'DE',   name: 'John Deere',        sector: 'Industrials',  reason: 'Agriculture/construction slows' },
      { sym: 'TSLA', name: 'Tesla',             sector: 'Autos',        reason: 'Big-ticket purchases deferred' },
      { sym: 'HD',   name: 'Home Depot',        sector: 'Home Improve', reason: 'Housing market freezes' },
      { sym: 'SBUX', name: 'Starbucks',         sector: 'Consumer',     reason: 'Discretionary spending cut' },
      { sym: 'LVS',  name: 'Las Vegas Sands',   sector: 'Casinos',      reason: 'Entertainment spending drops' },
    ],
    note: 'Defensive sectors (Staples, Healthcare, Utilities) outperform cyclicals by 15–20% during recession years. Cash and bonds surge.',
  },

  {
    id: 'inflation',
    keywords: ['inflation', 'cpi', 'pce', 'price surge', 'cost of living', 'supply shortage', 'stagflat'],
    label: 'High Inflation / CPI Spike',
    icon: '💸',
    up: [
      { sym: 'XOM',  name: 'ExxonMobil',        sector: 'Energy',       reason: 'Real assets outperform' },
      { sym: 'GLD',  name: 'SPDR Gold',         sector: 'Commodities',  reason: 'Classic inflation hedge' },
      { sym: 'USO',  name: 'US Oil Fund',       sector: 'Commodities',  reason: 'Oil drives headline CPI' },
      { sym: 'CF',   name: 'CF Industries',     sector: 'Fertilizers',  reason: 'Food inflation component' },
      { sym: 'MOS',  name: 'Mosaic',            sector: 'Fertilizers',  reason: 'Agricultural commodity prices' },
      { sym: 'BRK.B',name: 'Berkshire',         sector: 'Diversified',  reason: 'Hard assets, pricing power' },
    ],
    down: [
      { sym: 'TLT',  name: 'T-Bond ETF',        sector: 'Bonds',        reason: 'Fixed income loses real value' },
      { sym: 'IEF',  name: 'T-Note ETF',        sector: 'Bonds',        reason: 'Real yield turns negative' },
      { sym: 'NFLX', name: 'Netflix',           sector: 'Streaming',    reason: 'Subscription is first cut' },
      { sym: 'SHOP', name: 'Shopify',           sector: 'E-Commerce',   reason: 'Consumer discretionary slows' },
    ],
    note: 'Every 1% above expected CPI reading historically moves 10yr yields +8bps. Commodity producers and real assets outperform.',
  },

  {
    id: 'china_tension',
    keywords: ['china', 'taiwan', 'trade war', 'tariff', 'decoupling', 'chips act', 'semiconductor ban', 'export control'],
    label: 'US-China Tension / Trade War',
    icon: '🇨🇳',
    up: [
      { sym: 'LMT',  name: 'Lockheed Martin',   sector: 'Defense',      reason: 'Taiwan defense spending' },
      { sym: 'RTX',  name: 'Raytheon',          sector: 'Defense',      reason: 'Indo-Pacific arms sales' },
      { sym: 'INTC', name: 'Intel',             sector: 'Semis',        reason: 'Domestic chip manufacturing push' },
    ],
    down: [
      { sym: 'AAPL', name: 'Apple',             sector: 'Tech',         reason: '20% of revenue from China, manufactured there' },
      { sym: 'NVDA', name: 'Nvidia',            sector: 'Semis',        reason: 'China = 20%+ of GPU revenue' },
      { sym: 'AMD',  name: 'AMD',               sector: 'Semis',        reason: 'China data center exposure' },
      { sym: 'QCOM', name: 'Qualcomm',          sector: 'Semis',        reason: 'Handset chips for Chinese OEMs' },
      { sym: 'MU',   name: 'Micron',            sector: 'Semis',        reason: 'DRAM exports restricted' },
      { sym: 'TSM',  name: 'TSMC',              sector: 'Semis',        reason: 'Taiwan military risk premium' },
      { sym: 'NKE',  name: 'Nike',              sector: 'Consumer',     reason: 'Manufacturing + China revenue' },
    ],
    note: 'US chip export restrictions directly reduce NVDA\'s China revenue (was ~$10B/year). Apple is the most exposed mega-cap to China risk.',
  },

  {
    id: 'ai_boom',
    keywords: ['ai', 'artificial intelligence', 'chatgpt', 'llm', 'machine learning', 'data center', 'gpu demand'],
    label: 'AI Boom / Data Center Surge',
    icon: '🤖',
    up: [
      { sym: 'NVDA', name: 'Nvidia',            sector: 'Semis',        reason: 'H100/B100 GPU demand, monopoly' },
      { sym: 'AMD',  name: 'AMD',               sector: 'Semis',        reason: 'MI300 AI chip alternative' },
      { sym: 'MSFT', name: 'Microsoft',         sector: 'Tech',         reason: 'Azure AI + OpenAI partnership' },
      { sym: 'GOOGL',name: 'Alphabet',          sector: 'Tech',         reason: 'Gemini, TPU infrastructure' },
      { sym: 'META', name: 'Meta',              sector: 'Tech',         reason: 'Llama models, massive compute build' },
      { sym: 'AVGO', name: 'Broadcom',          sector: 'Semis',        reason: 'Custom AI ASICs, networking' },
      { sym: 'SMCI', name: 'Super Micro',       sector: 'Server HW',    reason: 'GPU server racks' },
      { sym: 'ANET', name: 'Arista Networks',   sector: 'Networking',   reason: 'Data center interconnects' },
    ],
    down: [
      { sym: 'IBM',  name: 'IBM',               sector: 'Legacy Tech',  reason: 'Displaced by modern AI' },
      { sym: 'WDC',  name: 'Western Digital',   sector: 'Storage',      reason: 'NAND oversupply vs GPU scarcity' },
    ],
    note: 'NVDA\'s data center revenue grew 400%+ YoY at peak AI boom. Every $1 of NVDA chip creates ~$8 of downstream cloud/software value.',
  },

  {
    id: 'crypto_rally',
    keywords: ['bitcoin', 'crypto', 'btc', 'ethereum', 'blockchain', 'defi', 'nft', 'coinbase', 'digital asset'],
    label: 'Crypto / Bitcoin Rally',
    icon: '₿',
    up: [
      { sym: 'COIN', name: 'Coinbase',          sector: 'Crypto',       reason: 'Trading volume and revenue spikes' },
      { sym: 'MSTR', name: 'MicroStrategy',     sector: 'Crypto',       reason: 'Leveraged BTC treasury' },
      { sym: 'RIOT', name: 'Riot Platforms',    sector: 'Mining',       reason: 'BTC mining profitability' },
      { sym: 'MARA', name: 'Marathon Digital',  sector: 'Mining',       reason: 'Hash rate exposure' },
      { sym: 'HOOD', name: 'Robinhood',         sector: 'Fintech',      reason: 'Crypto trading drives revenue' },
      { sym: 'SQ',   name: 'Block (Square)',    sector: 'Fintech',      reason: 'Bitcoin product revenue' },
    ],
    down: [
      { sym: 'JPM',  name: 'JPMorgan',          sector: 'Banks',        reason: 'Capital outflow to crypto' },
      { sym: 'GLD',  name: 'SPDR Gold',         sector: 'Safe Haven',   reason: 'Crypto competes as store of value' },
    ],
    note: 'COIN stock historically moves 3–5x the magnitude of BTC price change. Mining stocks can move 10x BTC on halving events.',
  },

  {
    id: 'banking_crisis',
    keywords: ['bank crisis', 'bank failure', 'svb', 'bank run', 'credit crunch', 'financial crisis', 'contagion', 'bank collapse'],
    label: 'Banking Crisis / Credit Stress',
    icon: '🏦',
    up: [
      { sym: 'GLD',  name: 'SPDR Gold',         sector: 'Safe Haven',   reason: 'Flight from financial system' },
      { sym: 'TLT',  name: 'T-Bond ETF',        sector: 'Bonds',        reason: 'Safest asset in a crisis' },
      { sym: 'WMT',  name: 'Walmart',           sector: 'Staples',      reason: 'Perceived as recession-proof' },
      { sym: 'MSTR', name: 'MicroStrategy',     sector: 'Crypto',       reason: 'Bitcoin as anti-banking hedge (debated)' },
    ],
    down: [
      { sym: 'BAC',  name: 'Bank of America',   sector: 'Banks',        reason: 'Direct contagion risk' },
      { sym: 'WFC',  name: 'Wells Fargo',       sector: 'Banks',        reason: 'Deposit flight risk' },
      { sym: 'C',    name: 'Citigroup',         sector: 'Banks',        reason: 'Global credit exposure' },
      { sym: 'SCHW', name: 'Charles Schwab',    sector: 'Brokers',      reason: 'Unrealized bond losses' },
      { sym: 'KRE',  name: 'Regional Banks ETF',sector: 'Banks',        reason: 'Regional banks most at risk' },
    ],
    note: 'SVB collapse caused KRE (regional bank ETF) to drop 28% in 2 weeks while GLD and TLT rallied 5–8%.',
  },

  {
    id: 'natural_disaster',
    keywords: ['hurricane', 'earthquake', 'flood', 'disaster', 'tsunami', 'wildfire', 'storm', 'catastrophe'],
    label: 'Natural Disaster',
    icon: '🌪️',
    up: [
      { sym: 'HD',   name: 'Home Depot',        sector: 'Home Improve', reason: 'Rebuilding demand surges' },
      { sym: 'LOW',  name: "Lowe's",            sector: 'Home Improve', reason: 'Construction materials demand' },
      { sym: 'CAT',  name: 'Caterpillar',       sector: 'Heavy Equip',  reason: 'Excavators, bulldozers for cleanup' },
      { sym: 'NEM',  name: 'Newmont Mining',    sector: 'Gold',         reason: 'Safe haven demand' },
    ],
    down: [
      { sym: 'ALL',  name: 'Allstate',          sector: 'Insurance',    reason: 'Catastrophe claims spike' },
      { sym: 'TRV',  name: 'Travelers',         sector: 'Insurance',    reason: 'Property/casualty payouts' },
      { sym: 'AIZ',  name: 'Assurant',          sector: 'Insurance',    reason: 'Specialty property claims' },
    ],
    note: 'Insurers typically drop 5–10% immediately after a major hurricane. Rebuilding beneficiaries (HD, LOW, CAT) rise weeks after the event.',
  },

  {
    id: 'pharma_approval',
    keywords: ['fda approval', 'drug', 'clinical trial', 'biotech', 'vaccine', 'treatment', 'cure', 'pharmaceutical'],
    label: 'FDA Approval / Drug Breakthrough',
    icon: '💊',
    up: [
      { sym: 'LLY',  name: 'Eli Lilly',         sector: 'Pharma',       reason: 'GLP-1/Ozempic category leader' },
      { sym: 'NVO',  name: 'Novo Nordisk',      sector: 'Pharma',       reason: 'Ozempic + Wegovy pipeline' },
      { sym: 'MRNA', name: 'Moderna',           sector: 'Biotech',      reason: 'mRNA platform approvals' },
      { sym: 'REGN', name: 'Regeneron',         sector: 'Biotech',      reason: 'Dupixent successor pipeline' },
    ],
    down: [
      { sym: 'WW',   name: 'WeightWatchers',    sector: 'Weight Mgmt',  reason: 'GLP-1 drugs obsolete legacy diets' },
      { sym: 'CASY', name: 'Casey\'s',          sector: 'Food/Snacks',  reason: 'Reduced snack/food consumption thesis' },
    ],
    note: 'A single FDA approval can move a mid-cap biotech 50–300% in one day. GLP-1 obesity drugs have structural implications for food/snack companies.',
  },

  {
    id: 'housing',
    keywords: ['housing', 'real estate', 'mortgage', 'home sales', 'construction', 'reit', 'property'],
    label: 'Housing Boom / Bust',
    icon: '🏠',
    up: [
      { sym: 'DHI',  name: 'D.R. Horton',       sector: 'Homebuilders', reason: 'Entry-level housing demand' },
      { sym: 'LEN',  name: 'Lennar',            sector: 'Homebuilders', reason: 'National builder scale' },
      { sym: 'PHM',  name: 'PulteGroup',        sector: 'Homebuilders', reason: 'Move-up and active adult' },
      { sym: 'HD',   name: 'Home Depot',        sector: 'Home Improve', reason: 'Renovation/upgrade spending' },
    ],
    down: [
      { sym: 'RKT',  name: 'Rocket Companies',  sector: 'Mortgages',    reason: 'Refi volume collapses in high-rate env.' },
      { sym: 'UWMC', name: 'UWM Holdings',      sector: 'Mortgages',    reason: 'Origination volume drops' },
    ],
    note: 'Each 1% increase in 30yr mortgage rate historically reduces home affordability by ~10% and builder stocks by 15–20%.',
  },

  {
    id: 'ev_adoption',
    keywords: ['electric vehicle', 'ev', 'tesla', 'charging', 'battery', 'lithium', 'clean energy', 'green'],
    label: 'EV / Clean Energy Surge',
    icon: '⚡',
    up: [
      { sym: 'TSLA', name: 'Tesla',             sector: 'EV',           reason: 'Largest EV brand globally' },
      { sym: 'RIVN', name: 'Rivian',            sector: 'EV',           reason: 'Commercial truck EV play' },
      { sym: 'ALB',  name: 'Albemarle',         sector: 'Lithium',      reason: 'Lithium supply for batteries' },
      { sym: 'LTHM', name: 'Livent',            sector: 'Lithium',      reason: 'Battery-grade lithium' },
      { sym: 'NEE',  name: 'NextEra Energy',    sector: 'Renewables',   reason: 'Solar + wind largest US utility' },
      { sym: 'CHPT', name: 'ChargePoint',       sector: 'EV Charging',  reason: 'EV infrastructure build-out' },
    ],
    down: [
      { sym: 'F',    name: 'Ford',              sector: 'Autos',        reason: 'Late EV pivot, margin pressure' },
      { sym: 'GM',   name: 'General Motors',    sector: 'Autos',        reason: 'Legacy ICE capacity stranded' },
      { sym: 'XOM',  name: 'ExxonMobil',        sector: 'Energy',       reason: 'Long-term demand destruction' },
    ],
    note: 'Every $10 drop in lithium prices removes ~$200 from EV battery cost (for a 75kWh pack). Tesla stock historically moves 2–3% on each 1% share change.',
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

function MoversGrid({ items, direction, onAnalyze }) {
  const color = direction === 'up' ? 'var(--green-text)' : 'var(--red-text)'
  const bg    = direction === 'up' ? 'var(--green-dim)'  : 'var(--red-dim)'
  const arrow = direction === 'up' ? '▲' : '▼'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map(item => (
        <div key={item.sym} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '7px 10px', borderRadius: 'var(--r-md)',
          background: 'var(--bg-primary)',
          border: `0.5px solid ${bg}`,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 10, background: bg, color, flexShrink: 0, marginTop: 1 }}>
            {arrow} {item.sym}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 500 }}>{item.name}
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 5 }}>{item.sector}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{item.reason}</div>
          </div>
          <button
            className="btn"
            style={{ fontSize: 9, padding: '2px 6px', flexShrink: 0 }}
            onClick={() => onAnalyze(item.sym)}
          >
            Chart
          </button>
        </div>
      ))}
    </div>
  )
}

export default function NewsImpactScanner({ onAnalyze }) {
  const [query,    setQuery]    = useState('')
  const [selected, setSelected] = useState(null)

  // Match typed query to themes
  const matched = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return THEMES.filter(t =>
      t.keywords.some(kw => q.includes(kw) || kw.includes(q)) ||
      t.label.toLowerCase().includes(q)
    )
  }, [query])

  const activeTheme = selected || (matched.length === 1 ? matched[0] : null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header + search */}
      <div className="card">
        <div className="panel-hd">
          <span className="panel-title">News Impact Scanner</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Type a news event → see which stocks historically move
          </span>
        </div>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(null) }}
          placeholder="e.g.  war,  oil spike,  fed rate hike,  AI,  bitcoin,  recession…"
          style={{ width: '100%', fontSize: 12 }}
          autoFocus
        />

        {/* Quick-pick theme buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`btn${activeTheme?.id === t.id ? ' btn-primary' : ''}`}
              style={{ fontSize: 10, padding: '3px 9px' }}
              onClick={() => { setSelected(t); setQuery(t.label) }}
            >
              {t.icon} {t.label.split(' / ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {activeTheme ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Theme header */}
          <div className="card" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>{activeTheme.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{activeTheme.label}</span>
            </div>
            {activeTheme.note && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', borderLeft: '3px solid var(--blue)' }}>
                {activeTheme.note}
              </div>
            )}
          </div>

          {/* Up / Down columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>📈</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-text)' }}>
                  Likely to go UP ({activeTheme.up.length})
                </span>
              </div>
              <MoversGrid items={activeTheme.up} direction="up" onAnalyze={onAnalyze} />
            </div>

            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>📉</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red-text)' }}>
                  Likely to go DOWN ({activeTheme.down.length})
                </span>
              </div>
              <MoversGrid items={activeTheme.down} direction="down" onAnalyze={onAnalyze} />
            </div>
          </div>
        </div>

      ) : matched.length > 1 ? (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Multiple themes match — pick one:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {matched.map(t => (
              <button key={t.id} className="btn" style={{ fontSize: 11 }}
                onClick={() => { setSelected(t); setQuery(t.label) }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

      ) : query.trim() && matched.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)', fontSize: 12 }}>
          No theme matched "<strong>{query}</strong>" — try the quick-pick buttons above or keywords like:
          war · oil · rate hike · recession · AI · bitcoin · china · inflation · housing · pharma
        </div>

      ) : (
        <div className="card" style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>How to use</div>
          <div style={{ lineHeight: 1.9 }}>
            1. Type a news event or click a theme button above<br />
            2. See which sectors and stocks historically <span style={{ color: 'var(--green-text)', fontWeight: 500 }}>rise</span> and <span style={{ color: 'var(--red-text)', fontWeight: 500 }}>fall</span> on that news<br />
            3. Click <strong>Chart</strong> on any stock to open it in the Analyzer<br />
            <br />
            <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
              Based on historical sector correlations, not a guarantee of future performance.
              News impact depends on magnitude and market context.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
