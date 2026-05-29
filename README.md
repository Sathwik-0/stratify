# Stratify — Business Intelligence Engine

> See exactly why businesses win.

---

## Stack
- **Next.js 14** (App Router)
- **Supabase** (Database + Realtime)
- **Groq / LLaMA 3.3 70B** (3-pass AI pipeline)
- **Apify** (Multi-source data collection)
- **Fraunces + DM Sans** (Typography)
- **Tailwind CSS** (Styling)

---

## Setup (5 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Copy `.env.example` to `.env.local` — all keys are pre-filled.

Only change you need:
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app  ← update after first Vercel deploy
```

### 3. Run locally
```bash
npm run dev
```
Visit http://localhost:3000

---

## Deploy to Vercel

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO
git push -u origin main
```

### Step 2: Import to Vercel
1. Go to vercel.com → New Project → Import your GitHub repo
2. Add all environment variables from `.env.local` to Vercel dashboard
3. Deploy

### Step 3: Update webhook URL
After first deploy, copy your Vercel URL (e.g. `https://stratify-xyz.vercel.app`)
Update in Vercel env vars:
```
NEXT_PUBLIC_APP_URL=https://stratify-xyz.vercel.app
```
Redeploy.

---

## How the pipeline works

```
User clicks "Run X-Ray"
    ↓
POST /api/xray/start
  → Creates job in Supabase
  → Triggers Apify Play Store scraper with webhook URL
  → Returns jobId instantly
    ↓
Frontend redirects to /loading-analysis?jobId=xxx
  → Subscribes to Supabase Realtime on jobs table
    ↓
Apify scrapes reviews on THEIR servers (30-90s)
  → Calls back your webhook when done
    ↓
POST /api/webhook/apify
  → Pass 1: Classify signals (Groq ~3s)
  → Pass 2: Cluster patterns (Groq ~3s)  
  → Pass 3: 6-Force analysis (Groq ~5s)
  → Stores result in Supabase
  → Updates job status to "completed"
    ↓
Supabase Realtime fires to loading page
  → Redirects to /xray/[slug]
```

---

## Pages

| Page | Route | Purpose |
|------|-------|---------|
| Homepage | `/` | Hero + company cards + how it works |
| Loading | `/loading-analysis` | Live pipeline progress |
| X-Ray | `/xray/[slug]` | Full 6-Force analysis |
| Explore | `/explore` | Company discovery feed |
| Compare | `/compare` | Side-by-side comparison |

---

## Database (already set up)

Your Supabase project `yrwrjnatmbgxneawfvqs` has all 13 tables created and seeded with 10 companies.

---

## After launch — rotate your Groq key
The Groq API key was shared during setup. Rotate it at console.groq.com after going live.
