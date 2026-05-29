# Stratify

Stratify is an investor-grade Google Play intelligence MVP. It scrapes public Play Store reviews, runs a multi-pass Groq analysis pipeline, persists results in Supabase, and renders X-Ray reports plus company comparisons.

## Stack

- Next.js 16 App Router
- React 19
- Supabase database and realtime job state
- Groq `llama-3.1-8b-instant`
- `google-play-scraper`
- TypeScript, ESLint, Tailwind CSS

## Architecture

```text
User search/start
  -> POST /api/xray/search
  -> POST /api/xray/start
  -> google-play-scraper provider
  -> jobs row updated to scraped
  -> POST /api/xray/poll runs Groq passes
  -> xray_results upsert
  -> GET /api/xray/result
  -> /xray/[slug] renders normalized report
```

The active pipeline is single-source Google Play. Apify has been removed; `/api/webhook/apify` remains only as a `410 Gone` compatibility stub.

## Local Setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`

Recommended:

- `NEXT_PUBLIC_APP_URL`
- `DEBUG_SECRET`
- `DEV_BYPASS_RATE_LIMIT=true` for local testing only

Never commit `.env`, `.env.local`, Groq keys, or Supabase service role keys.

## Supabase Setup

The app expects these core tables:

- `companies`
- `jobs`
- `xray_results`
- `compare_cache`
- `rate_limits`
- optional telemetry/eval tables used by the current pipeline

Run the migration in `supabase/migrations/add_rate_limits.sql` if the durable limiter table does not exist.

## Groq Setup

Create a Groq API key at `https://console.groq.com`, set `GROQ_API_KEY`, then run:

```bash
npm run typecheck
npm run build
```

The Groq client includes retry handling, JSON repair, truncation detection, schema validation, and pass-level telemetry.

## Google Play Scraper

Search and scraping use `google-play-scraper`. Known edge case: Zepto package `com.zeptoconsumerapp` can return `Error requesting Google Play` in local testing, which is tracked as a provider retrieval issue rather than an application rate-limit failure.

## Analysis Pipeline

1. Pass 1 classifies review text into business signals.
2. Pass 2 clusters signals.
3. Pass 3 creates the main investor framework.
4. CEO playbook and investment passes add operating and investment views.
5. Delta synthesis compares with prior data when available.
6. Quality gates record structural, grounding, consistency, and regression diagnostics.

If Groq output is malformed or truncated, the pipeline uses structured fallbacks and never persists broken partial JSON silently.

## Caching

`/api/xray/start` checks completed results before applying rate limits. Existing reports return immediately with:

- `cached`
- `analyzedAt`
- `freshness`
- `refresh.forceRefreshAvailable`

Future hooks exist for `forceRefresh` and `refreshPolicy`, but no background revalidation, workers, or queues are implemented yet.

## Rate Limits

Production rate limiting is Supabase-backed and applies only to expensive new analysis/comparison work.

Development bypass is allowed only when:

- `NODE_ENV=development`
- request host is localhost / `127.0.0.1` / `::1`
- `DEV_BYPASS_RATE_LIMIT=true` and `NODE_ENV !== production`

Production users do not bypass rate limits.

## Compare Pipeline

`/api/compare` reuses `compare_cache` first. Fresh comparison work is rate-limited, Groq-validated, and cached for reuse.

## Health Check

Use:

```text
GET /api/health
```

It reports environment readiness, database connectivity, deployment environment, and latency without exposing secret values.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

Smoke checks:

- `/api/health`
- `/api/xray/start` for cached `phonepe`, `swiggy`, `cred`
- `/xray/phonepe`
- `/xray/cred`
- `/api/compare` for `phonepe` vs `swiggy`

## Deployment

Deploy on Vercel from GitHub `main`.

1. Configure all required environment variables in Vercel.
2. Keep `DEV_BYPASS_RATE_LIMIT` unset in production.
3. Ensure GitHub Actions secrets exist if CI builds require env values.
4. Run `/api/health` after deployment.

See `docs/deployment-checklist.md`.

## Workflow

- `main`: production-ready
- `dev`: integration
- `feature/*`: isolated changes

Use conventional commits. See `docs/branching-and-commits.md`.

## Troubleshooting

See:

- `docs/debugging-checklist.md`
- `docs/recovery.md`

Key recovery principle: prefer small commits and `git revert` over force pushes.

## Known Limitations

- Current MVP is Google Play only.
- Zepto currently exposes a `google-play-scraper` retrieval failure in this local environment.
- No queues, workers, vector DB, Reddit, YouTube, LinkedIn, subscriptions, or enterprise orchestration are implemented yet.
