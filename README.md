# Trading Platform 📈

A real-time stock market analysis platform with options chain analysis, technical indicators, and market scanning.

## 📊 Data Sources

This platform uses **real-time market data** from multiple sources:

### Primary: AlphaVantage ⭐
- **Real-time stock quotes** (updated every ~100ms during market hours)
- **Daily price data** (60+ days of historical data)
- **Technical indicators** (SMA, RSI, MACD, etc.)
- **Free tier**: 5 requests/minute, 500 requests/day
- **Paid tiers**: Up to 120 requests/minute, 5M+ requests/day

### Fallback: Yahoo Finance
- Used when AlphaVantage is rate-limited
- Up-to-date market data via CORS proxies
- Good for backtesting and historical analysis

### Options Data
- **Tradier Sandbox** - Real options chain data
- **Yahoo Finance** - Live options data
- **Black-Scholes Synthetic** - Estimated data when APIs are unavailable

## 🚀 Quick Start

### 1. Installation
```bash
npm install
npm run dev
```

The app will open at `http://localhost:3000`

### 2. Get Real-Time Data (Recommended)

To get **real-time market data** without rate limits, get a **FREE API key** from AlphaVantage:

1. Go to: [https://www.alphavantage.co/](https://www.alphavantage.co/)
2. Sign up (takes 30 seconds)
3. Copy your API key
4. Edit `.env` file and replace:
   ```
   VITE_ALPHA_VANTAGE_API_KEY=your_api_key_here
   ```
5. Restart the dev server: `npm run dev`

**Free Tier Limits:**
- 5 requests per minute
- 500 requests per day
- Sufficient for active traders monitoring 10-20 stocks

**Upgrade to Premium** (if needed):
- $30/month: 120 requests/minute
- $100/month: 5,000 requests/minute

## 📈 Features

### Dashboard
- **Market Overview**: S&P 500, Nasdaq, VIX, Fear & Greed index
- **Market Scanner**: Top gainers/losers with volume analysis
- **Earnings Calendar**: Upcoming earnings with tracking
- **Sector Heatmap**: Real-time sector performance
- **Options Flow**: Put/call analysis across key tickers

### Analyzer 🔬
- Real-time quote with price, change, market cap
- Technical analysis and news
- Options chain with max pain calculations
- P/C flow analysis and unusual activity detection

### Compare 📊
- Side-by-side stock comparison
- Price, volume, 52-week ranges
- Custom watchlist management

### Tracker 📌
- Personal stock watchlist
- Real-time price updates
- Quick access to analysis

### Export 💾
- Export analysis as JSON/CSV
- Save strategies and research

## 🔑 API Keys

### AlphaVantage (Required for Real-Time Data)
```
Free: https://www.alphavantage.co/
Premium: Starting at $30/month
```

### Optional APIs (For Future Enhancement)
- **Polygon.io**: Options and crypto data
- **IEX Cloud**: Comprehensive financial data
- **Finnhub**: News and sentiment analysis

## 📝 Environment Variables

Copy `.env.example` to `.env` and fill in API keys:

```bash
# AlphaVantage (REQUIRED for real-time data)
VITE_ALPHA_VANTAGE_API_KEY=your_key_here

# Optional: Additional data sources
VITE_POLYGON_API_KEY=your_key_here
VITE_IEX_API_KEY=your_key_here
VITE_FINNHUB_API_KEY=your_key_here
```

## 🏗️ Architecture

```
src/
├── api/
│   ├── alphaVantage.js      ← Real-time stock data
│   ├── yahooFinance.js      ← Fallback & historical data
│   ├── optionsApi.js        ← Options chain data
│
├── components/
│   ├── Dashboard.jsx        ← Market overview
│   ├── Analyzer.jsx         ← Stock analysis
│   ├── Compare.jsx          ← Multi-stock comparison
│   ├── Tracker.jsx          ← Personal watchlist
│   ├── ExportTab.jsx        ← Data export
│   └── OptionsDetail.jsx    ← Options analysis
│
├── styles/
│   ├── globals.css
│   └── components.css
│
└── utils/
    └── helpers.js           ← Formatting utilities
```

## 🔄 Data Refresh Strategy

1. **First Request**: Tries AlphaVantage → Falls back to Yahoo Finance
2. **Rate Limiting**: Respects 5 req/min limit by staggering requests
3. **Caching**: 1-minute client-side cache to avoid redundant calls
4. **Auto-Refresh**: Dashboard updates every 1-4 hours (configurable)

## 📊 Supported Indicators

### Technical Analysis
- **SMA**: Simple Moving Average (20, 50, 200-day)
- **RSI**: Relative Strength Index (overbought/oversold)
- **MACD**: Moving Average Convergence Divergence
- **Bollinger Bands**: Volatility analysis

### Options Analysis
- **P/C Ratio**: Put/Call volume and open interest
- **Max Pain**: Level with max losses for option sellers
- **IV Rank**: Implied volatility percentile
- **Unusual Activity**: High volume with low OI

## 🚨 Troubleshooting

### "Application not loading"
- Check browser console for errors (F12)
- Ensure `npm install` completed successfully
- Verify `.env` file exists in project root

### "Data is cached"
- Client caches data for 1 minute (to respect rate limits)
- Clear browser cache or wait 60 seconds
- Or click "Refresh" button for immediate update

### "Rate limited"
- AlphaVantage free tier: 5 req/min
- Spread requests across stocks
- Use paid tier for more requests
- Platform auto-falls back to Yahoo Finance

### "Options data is synthetic"
- Free tier may not have real options data
- Uses Black-Scholes estimation (labeled in app)
- Upgrade Tradier/AlphaVantage for real data

## 📚 Useful Links

- **AlphaVantage**: https://www.alphavantage.co/documentation/
- **Vite**: https://vitejs.dev/
- **React**: https://react.dev/
- **Financial Terms**: https://www.investopedia.com/

## 🤝 Contributing

Feel free to submit issues or PRs to improve data sources or analysis features!

## 📄 License

MIT - Feel free to use for personal trading analysis

---

**Note**: This is a research and analysis tool. Not financial advice. Always do your own research before trading.

