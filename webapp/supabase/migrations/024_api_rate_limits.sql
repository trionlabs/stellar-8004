-- 024_api_rate_limits.sql
--
-- DB-backed rate limiting for the public REST API edge function.
-- Replaces the in-memory Map which resets on every cold start.
--
-- Design:
--   - private schema (not accessible via PostgREST API)
--   - Composite index on (ip, requested_at DESC) for fast window lookups
--   - pg_cron job purges rows older than 10 minutes every 5 minutes
--   - Window: 60 seconds, limit: 30 requests per IP

-- Schema
CREATE SCHEMA IF NOT EXISTS private;

-- Table
CREATE TABLE IF NOT EXISTS private.api_rate_limits (
  ip    inet        NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_ip_time
  ON private.api_rate_limits (ip, requested_at DESC);

-- Cleanup function
CREATE OR REPLACE FUNCTION private.cleanup_api_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM private.api_rate_limits
  WHERE requested_at < now() - interval '10 minutes';
$$;

-- Schedule cleanup every 5 minutes
SELECT cron.schedule(
  'cleanup-api-rate-limits',
  '*/5 * * * *',
  $$ SELECT private.cleanup_api_rate_limits(); $$
);