# 🚀 Real-Time Data Integration - Setup Guide

## What Changed

Your trading platform now uses **AlphaVantage** for real-time stock market data instead of relying on cached/delayed data.

### Before ≠ After

- **Before**: Yahoo Finance (3-20 min delayed), Synthetic Black-Scholes estimation
- **After**: AlphaVantage (Real-time quotes) + Yahoo Finance (Fallback) + Synthetic (Final fallback)

---

## 🔑 Getting Your API Key (5 minutes)

### Step 1: Sign up for AlphaVantage
1. Visit: **https://www.alphavantage.co/**
2. Click "GET FREE API KEY"
3. Enter your name and email
4. You'll get an API key instantly (check spam if not in inbox)

### Step 2: Add API key to your project
1. Open `.env` file in project root
2. Replace:
   ```
   VITE_ALPHA_VANTAGE_API_KEY=demo
   ```
   with:
   ```
   VITE_ALPHA_VANTAGE_API_KEY=your_actual_api_key_here
   ```
3. Save the file
4. Restart dev server: `npm run dev`

### Step 3: You're done! 🎉
- The app now fetches **real-time stock data**
- Market data updates as soon as you load the Dashboard
- All stock quotes are live (not 15-20 min delayed)

---

## 📊 What You Get

### With Your Personal API Key:
- ✅ Real-time stock quotes
- ✅ 60+ days of historical candlestick data
- ✅ Technical indicators (SMA, RSI, MACD)
- ✅ Up to 5 requests/minute (demo limit)
- ✅ Up to 500 requests/day

### If you need more:
- **$30/month**: 120 requests/minute
- **$100/month**: 5,000 requests/minute
- **Enterprise**: Custom pricing

---

## 🔄 How Data Fallback Works

The app tries sources in this order:

1. **AlphaVantage** (Real-time, best quality)
2. **Yahoo Finance** (If AV is rate-limited or fails)
3. **Synthetic Black-Scholes** (Estimated, always works)

You'll see logs in the browser console showing which source was used:
```
[getQuotes] Trying AlphaVantage for 5 symbols
[getQuotes] AlphaVantage returned 5 quotes
```

---

## 💡 Pro Tips

### Rate Limiting
- Free tier: 5 requests/minute
- Stagger heavy requests (don't fetch 20 stocks at once)
- Use the refresh button instead of auto-refresh every minute
- Set auto-refresh to 1 hour (not 15 min)

### Best Practices
1. **Monitor fewer stocks** (10-15 main watchlist, not 50+)
2. **Use Categories** in Dashboard options flow to group by type
3. **Set longer refresh intervals** during market hours
4. **Mark favorites** to prioritize updates

### Troubleshooting
If you see "Rate limited":
- Wait 60 seconds and refresh
- Check browser console for logs
- Reduce number of stocks being tracked
- Upgrade to paid plan if doing heavy analysis

---

## 📁 Files Changed/Added

```
New files:
- src/api/alphaVantage.js      ← Real-time API wrapper
- .env                         ← API key storage (git-ignored)
- .env.example                 ← Template for others
- .gitignore                   ← Protects .env files
- README.md                    ← Full documentation

Updated files:
- src/api/yahooFinance.js      ← Now uses AlphaVantage first
- src/components/Analyzer.jsx  ← Fixed import bug
```

---

## ✨ Features Now Enabled

With real-time data, you can:

### Dashboard
- See **live S&P 500, QQQ, VIX** updates
- Real **gainers/losers scanner** with actual data
- **Options flow** analysis (P/C ratios accurate)
- **Sector heatmap** in real-time

### Analyzer
- Fetch actual historical data (60 days)
- View real price charts with accurate OHLCV
- See genuine options chains
- Track real market sentiment

### Compare
- Side-by-side stock comparison with live prices
- Real 52-week highs/lows
- Actual volume data

### Tracker
- Live price tracking of personal watchlist
- Real-time alerts (if you add them)

---

## 🔗 Useful Links

- **AlphaVantage Documentation**: https://www.alphavantage.co/documentation/
- **API Response Examples**: https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=demo
- **Stock Indicators**: https://www.investopedia.com/

---

## 🤔 Questions?

### "Will my API key be exposed?"
No! It's in `.env` which is in `.gitignore` (never committed to git)

### "Can I use multiple API keys?"
Yes, see `.env.example` for polygon.io and IEX Cloud

### "What if I don't want to use AlphaVantage?"
The app still works with Yahoo Finance (just slower updates)

### "How do I know which source was used?"
Check browser console: Press **F12 → Console tab**

---

## ✅ Verification Checklist

- [ ] Got API key from alphavantage.co
- [ ] Added key to `.env` file
- [ ] Dev server restarted (`npm run dev`)
- [ ] Dashboard loads without errors
- [ ] See `[getQuotes] AlphaVantage returned...` in console
- [ ] Stock prices match Google Finance / Yahoo
- [ ] Historical charts display data

---

**You're all set!** 🎉 Your trading platform now has real-time market data.

Start by navigating to the **Dashboard** to see live quotes for S&P 500, QQQ, and VIX.

