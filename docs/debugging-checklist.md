# Debugging Checklist

## Broken Build

1. Run `npm run typecheck`.
2. Run `npm run lint`.
3. Run `npm run build`.
4. If Next cache is corrupted, stop the dev server and delete `.next`.
5. Reinstall only when dependency state is suspect: delete `node_modules`, then run `npm ci`.

## Broken Environment

1. Compare `.env.local` against `.env.example`.
2. Verify `/api/health` output.
3. Confirm Supabase URL, anon key, service role key, and Groq key are set.
4. Never paste secrets into GitHub issues, commits, or logs.

## Failed X-Ray

1. Capture the correlation ID from the loading UI or job metadata.
2. Check scrape status and provider results.
3. Check Groq pass telemetry for latency, retries, truncation, and validation failures.
4. Check Supabase persistence diagnostics.
5. Fetch `/api/xray/result?slug=<slug>` to separate persistence from rendering.

## Failed Migration

1. Stop app writes if the migration affects live tables.
2. Inspect the failing SQL and Supabase error.
3. Prefer forward fixes over destructive rollback.
4. If a local migration is corrupt, create a new corrective migration rather than editing applied history.

## Known Zepto Issue

`google-play-scraper` currently fails for `com.zeptoconsumerapp` in local testing with `Error requesting Google Play`. Treat this as a provider retrieval issue, not a rate-limit failure.
