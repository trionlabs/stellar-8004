-- 029_resolve_uri_backoff.sql
-- Add a last_resolve_attempt_at timestamp so the resolve-uris edge function
-- can apply exponential backoff between retries instead of hammering a
-- transient gateway outage straight through to the MAX_ATTEMPTS cap. The
-- backoff threshold is computed in the edge function as
--   now() - last_resolve_attempt_at > pow(2, attempts) * '1 minute'::interval
-- so attempt 1 waits 2 minutes, attempt 5 waits 32 minutes, etc.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS last_resolve_attempt_at timestamptz;

-- Backfill: agents that have already attempted resolution should be
-- considered "ready to retry" immediately (NULL means "no recorded attempt").
-- The edge function treats NULL as "always eligible" so this is a no-op
-- migration for existing rows.

CREATE INDEX IF NOT EXISTS idx_agents_resolve_pending
  ON public.agents (last_resolve_attempt_at NULLS FIRST)
  WHERE resolve_uri_pending = true;
