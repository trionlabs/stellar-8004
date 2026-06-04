-- 045_indexer_dead_letter.sql
--
-- AUDITABLE COMPLETENESS (G3). The indexer has two paths that PERMANENTLY drop
-- on-chain events and advance the checkpoint past them:
--   1. the MAX_DEFER_ATTEMPTS escape hatch (a write that keeps failing is
--      eventually skipped so a poison event can't wedge the stream forever);
--   2. the RPC retention clamp (when the resume point has aged out of the RPC
--      retention window, the start ledger jumps forward, skipping the gap).
-- Today both only emit an ephemeral error-level log. Under 8004's faithful-
-- mirror principle a silently dropped fact is indistinguishable from
-- censorship: the loss must be DURABLE and REPLAYABLE, not a log line.
--
-- This table is the dead-letter: every skipped event / clamped range is
-- recorded here before the checkpoint advances, so an operator (or the
-- health endpoint) can see exactly what was dropped and replay it via the
-- backfill over the recorded ledger range.
--
-- Internal-only: written by the SECURITY-context indexer (service_role),
-- never by anon/authenticated. RLS on, public roles revoked.

CREATE TABLE IF NOT EXISTS public.indexer_dead_letter (
  id          bigserial PRIMARY KEY,
  contract    text NOT NULL,
  reason      text NOT NULL,           -- 'skip-retryable' | 'skip-nonretryable' | 'retention-clamp'
  event_id    text,                    -- Soroban paging token of the skipped event (null for a range)
  ledger      bigint,                  -- the skipped event's ledger, or the clamp's from-ledger
  detail      text,                    -- human/error context (e.g. the failing write message or the clamped range)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_indexer_dead_letter_created_at
  ON public.indexer_dead_letter (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_indexer_dead_letter_contract
  ON public.indexer_dead_letter (contract, created_at DESC);

ALTER TABLE public.indexer_dead_letter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.indexer_dead_letter FROM anon, authenticated;
