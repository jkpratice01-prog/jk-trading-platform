# 🚀 Deployment Guide

Complete guide to deploying Trading Platform to production.

---

## Table of Contents

1. [GitHub Preparation](#github-preparation)
2. [Vercel Deployment (Recommended)](#vercel-deployment)
3. [Docker Deployment](#docker-deployment)
4. [Other Platforms](#other-platforms)
5. [CI/CD Setup](#cicd-setup)
6. [Environment Variables](#environment-variables)
7. [Monitoring & Updates](#monitoring--updates)

---

## GitHub Preparation

### Step 1: Verify Files Are Ready

Ensure these files are in your repository:

```
✅ LICENSE                          # MIT License
✅ README.md or README_OPENSOURCE.md # Main documentation
✅ package.json                      # Dependencies
✅ vite.config.js                    # Vite config
✅ index.html                        # Entry HTML
✅ src/                             # Source files
✅ .gitignore                       # Git ignore rules
✅ .env.example                     # Env template
```

### Step 2: Update .gitignore

```bash
# Ensure these are in .gitignore (NOT committed):
.env
.env.local
.env.*.local
node_modules/
dist/
build/
```

### Step 3: Create GitHub Repository

```bash
# Initialize git (if not already)
git init

# Add all files
git add .

# First commit
git commit -m "chore: init trading platform"

# Create repo on github.com

# Add remote and push
git remote add origin https://github.com/YOUR-USERNAME/trading-platform.git
git branch -M main
git push -u origin main
```

---

## Vercel Deployment (⭐ RECOMMENDED)

**Best for:** Vite + React apps, easiest setup, free tier

### Option A: Via Dashboard (5 minutes)

1. **Sign up** at [vercel.com](https://vercel.com) (free)
2. Click **"New Project"**
3. **Import** your GitHub repository
4. **Framework:** Select "Vite"
5. **Environment Variables:**
   - Name: `VITE_ALPHA_VANTAGE_API_KEY`
   - Value: Your AlphaVantage key
6. Click **"Deploy"** ✅

Your app launches at: `your-project.vercel.app`

### Option B: Via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts and set environment variable
```

### Automatic Deployments

After setup, Vercel automatically deploys when you:
```bash
git push origin main
```

### Set Up Custom Domain

1. In Vercel dashboard, go to **Settings** → **Domains**
2. Add your domain (e.g., trading-platform.com)
3. Add DNS records as instructed
4. Done! 🎉

---

## Docker Deployment

**Best for:** Full control, Linux servers, any cloud provider

### Build Docker Image

```bash
# Build image
docker build -t trading-platform:latest .

# Run locally to test
docker run -p 3000:3000 \
  -e VITE_ALPHA_VANTAGE_API_KEY=your_key \
  trading-platform:latest
```

### Deploy to Docker Hub

```bash
# Login to Docker Hub
docker login

# Tag image
docker tag trading-platform:latest YOUR-USERNAME/trading-platform:latest

# Push to Hub
docker push YOUR-USERNAME/trading-platform:latest

# Others can run:
docker run -p 3000:3000 YOUR-USERNAME/trading-platform:latest
```

### Use docker-compose (Local Development)

```bash
# Create .env file
cp .env.example .env
# Edit .env and add your API key

# Start both development and production servers
docker-compose up -d

# Development server: http://localhost:5173
# Production server: http://localhost:3000

# Stop
docker-compose down
```

---

## Other Platforms

### Railway.app

1. Connect GitHub
2. Select trading-platform repository
3. Add environment variables
4. Deploy!

**Cost:** Free tier or pay-as-you-go

**Website:** [railway.app](https://railway.app)

### Netlify

1. Connect GitHub
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variables
5. Deploy!

**Website:** [netlify.com](https://netlify.com)

### AWS Amplify

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize
amplify init

# Deploy
amplify publish
```

**Website:** [aws.amazon.com/amplify](https://aws.amazon.com/amplify)

### Google Cloud Run

```bash
# Build image
docker build -t trading-platform .

# Push to Google Container Registry
docker tag trading-platform gcr.io/PROJECT-ID/trading-platform
docker push gcr.io/PROJECT-ID/trading-platform

# Deploy
gcloud run deploy trading-platform \
  --image gcr.io/PROJECT-ID/trading-platform \
  --set-env-vars VITE_ALPHA_VANTAGE_API_KEY=your_key
```

---

## CI/CD Setup

### GitHub Actions (Automatic)

We've included `.github/workflows/build-deploy.yml` for automatic:
- ✅ Building on every push
- ✅ Testing on main and develop branches
- ✅ Auto-deploy to Vercel (when configured)

### Setup GitHub Secrets

1. Go to GitHub repo → **Settings** → **Secrets**
2. Add these secrets:

```
ALPHA_VANTAGE_API_KEY=your_key_here
VERCEL_TOKEN=token_from_vercel
VERCEL_ORG_ID=org_id_from_vercel
VERCEL_PROJECT_ID=project_id_from_vercel
```

### Get Vercel Secrets

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Show tokens
vercel env list

# Get project ID
ls .vercel/project.json
```

---

## Environment Variables

### Required for All Deployments

```env
# AlphaVantage API key (required, free)
VITE_ALPHA_VANTAGE_API_KEY=your_key_here
```

### Optional

```env
# Polygon.io (optional, for more features)
VITE_POLYGON_API_KEY=your_key_here

# IEX Cloud (optional)
VITE_IEX_API_KEY=your_key_here

# Finnhub (optional)
VITE_FINNHUB_API_KEY=your_key_here
```

### Setting for Different Platforms

**Vercel:**
- Dashboard → Settings → Environment Variables

**Docker:**
```bash
docker run -e VITE_ALPHA_VANTAGE_API_KEY=... trade-platform
```

**docker-compose:**
```yaml
environment:
  - VITE_ALPHA_VANTAGE_API_KEY=${VITE_ALPHA_VANTAGE_API_KEY}
```

**GitHub Actions:**
- Settings → Secrets → New repository secret

---

## Monitoring & Updates

### Monitor Deployment

**Vercel:**
- Dashboard shows all deployments
- Automatic rollback if build fails
- Performance analytics included

**Docker:**
```bash
# Check running containers
docker ps

# View logs
docker logs container_name

# Stop/restart
docker stop container_name
docker start container_name
```

### Update Your Deployment

1. **Make changes** locally
2. **Test:** `npm run build` and `npm run dev`
3. **Commit:** `git add . && git commit -m "feat: describe changes"`
4. **Push:** `git push origin main`
5. **Wait:** Deployment happens automatically
6. **Verify:** Check live site

### Rollback if Issues

**Vercel:**
- Click deployment in dashboard
- Select previous version
- Click "Promote to Production"

**Docker:**
- Rebuild with previous tag
- Restart container

---

## Testing Before Deploy

### Run Production Build Locally

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Or use Vercel CLI
vercel --prod
```

### Check Everything Works

```bash
# Open http://localhost:4173 (or preview URL)

# In browser console (F12):

# 1. Look for green ✅ messages
# 2. See 💹 REAL DATA: prices
# 3. Verify prices are real (check Google Finance)
# 4. Check all tabs work (Dashboard, Analyzer, etc.)
```

---

## SSL & HTTPS

✅ **Automatic for all platforms:**
- Vercel: Automatic SSL
- Netlify: Automatic SSL
- Docker: Use nginx (if needed)
- GitHub Pages: Automatic SSL

---

## Performance Optimization

### Images & Assets

```bash
# Optimize in vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {...}
      }
    }
  }
})
```

### Caching

Set cache headers in `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

---

## Troubleshooting

### Build Fails

```bash
# Check logs
npm run build

# Common issues:
npm install  # Missing dependencies
rm dist      # Clear old build
npm update   # Update dependencies
```

### App Shows 404

Check these:
- ✅ Build output is `dist/` folder
- ✅ index.html is in dist
- ✅ All assets are in dist

### API Key Not Working

```bash
# Verify in code
console.log(import.meta.env.VITE_ALPHA_VANTAGE_API_KEY)

# Check environment variable is set correctly
# Redeploy after setting secret
```

### Slow Performance

```bash
# Check what's slow
# Open DevTools → Performance tab
# Profile with Lighthouse

# Optimize:
# - Reduce bundle size
# - Use CDN
# - Enable caching
# - Defer non-critical JS
```

---

## Security Checklist

Before going live:

- [ ] API keys in `.env` (not in code)
- [ ] .gitignore prevents `.env` commits
- [ ] HTTPS enabled (automatic on all platforms)
- [ ] Environment variables set on platform
- [ ] API key rotated if ever exposed
- [ ] Code reviewed for hardcoded secrets
- [ ] Dependencies updated (`npm audit`)

---

## Going Public

### Share Your Deployment

1. **Add to GitHub**
   ```bash
   git push origin main
   ```

2. **Share deploymentURL:**
   - "Try the live demo: https://trading-platform.vercel.app"

3. **Post on social media:**
   - Twitter/LinkedIn with screenshot
   - Reddit (r/algotrading, r/programming)
   - Hacker News
   - Product Hunt

4. **Get feedback:**
   - GitHub Issues for bug reports
   - GitHub Discussions for feature requests
   - Twitter for feedback

---

## Support

Need help?
- 📖 Check repo [README](README.md)
- 🔍 Search [GitHub Issues](../../issues)
- 💬 Start [GitHub Discussion](../../discussions)

---

**Your app is live! 🎉 Celebrate and share!**

