# Deployment Checklist

## Before Deploy

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `.env.local` is not committed
- [ ] Vercel has all required environment variables
- [ ] `/api/health` returns `ok: true` locally
- [ ] Cached reports open for PhonePe, Swiggy, and CRED
- [ ] Compare flow works for at least one pair

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `NEXT_PUBLIC_APP_URL`

## Production Safety

- Do not set `DEV_BYPASS_RATE_LIMIT=true` in production.
- Confirm `NODE_ENV=production` on Vercel.
- Confirm Supabase `rate_limits` table exists.
- Confirm GitHub Actions secrets are configured if CI build runs against production env values.

## After Deploy

- [ ] Visit `/api/health`
- [ ] Start a cached X-Ray and verify it bypasses rate limit
- [ ] Start one fresh X-Ray and verify job progresses
- [ ] Confirm `/xray/[slug]` renders
- [ ] Confirm `/compare` renders
