# Recovery Runbook

## Revert a Bad Code Change

Use a normal revert so history remains auditable:

```bash
git revert <commit-sha>
git push
```

## Reset Local Dev State

```bash
# Stop the dev server first.
Remove-Item -Recurse -Force .next
npm ci
npm run dev
```

## Recover From Broken Env Config

1. Copy `.env.example` to `.env.local`.
2. Re-enter Supabase and Groq secrets from the provider dashboards.
3. Verify `NEXT_PUBLIC_APP_URL`.
4. Run `/api/health`.

## Recover Failed Analysis Jobs

1. Locate the job by correlation ID in Supabase.
2. Inspect `jobs.status`, `jobs.error_message`, and `jobs.metadata`.
3. If result persistence succeeded, open `/xray/[slug]` directly.
4. If only partial metadata exists, use the loading failure panel diagnostics.
5. Retry from the UI after provider or Groq rate limits reset.

## Recover From DB Schema Mismatch

1. Check server logs for missing column names.
2. Confirm the `xray_results` schema in Supabase.
3. Add a forward-compatible migration.
4. Keep the normalization layer tolerant of older rows.
