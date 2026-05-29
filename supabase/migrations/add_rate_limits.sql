-- supabase/migrations/add_rate_limits.sql
-- Required for production-grade Supabase-backed rate limiting.
-- Run this in your Supabase SQL editor or via supabase db push.

CREATE TABLE IF NOT EXISTS rate_limits (
  ip           TEXT        NOT NULL,
  endpoint     TEXT        NOT NULL DEFAULT 'default',
  count        INTEGER     NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ip, endpoint)
);

-- Index for fast lookups by IP
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits (ip);

-- Auto-clean old entries (older than 2 hours) via Supabase cron or pg_cron
-- Example pg_cron job (run in Supabase SQL editor if pg_cron enabled):
-- SELECT cron.schedule('clean-rate-limits', '0 * * * *',
--   $$DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '2 hours'$$
-- );

-- Also add eval_summary column to xray_results if not exists
ALTER TABLE xray_results
  ADD COLUMN IF NOT EXISTS eval_summary JSONB;
