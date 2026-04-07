-- 017_performance_and_integrity_fixes.sql
-- Comprehensive DB hardening: indexes, concurrency fix, RLS, monitoring, constraints.
-- See: DB schema review (2026-04-05) — 10 findings, all resolved here.

-- =============================================================================
-- #1 [CRITICAL] Restore FOR UPDATE in insert_feedback_response
-- Migration 016 recreated this function without the FOR UPDATE lock from 013.
-- Without it, concurrent indexer runs can read the same MAX(response_index),
-- derive the same next index, and one insert silently gets DO NOTHING → data loss.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.insert_feedback_response(
  p_agent_id integer,
  p_client_address text,
  p_feedback_index bigint,
  p_responder text,
  p_response_uri text,
  p_response_hash text,
  p_created_at timestamptz,
  p_tx_hash text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $$
DECLARE
  v_next_index integer;
BEGIN
  SELECT COALESCE(MAX(response_index), 0) + 1
  INTO v_next_index
  FROM public.feedback_responses
  WHERE agent_id = p_agent_id
    AND client_address = p_client_address
    AND feedback_index = p_feedback_index
  FOR UPDATE;

  INSERT INTO public.feedback_responses (
    agent_id, client_address, feedback_index, response_index,
    responder, response_uri, response_hash, created_at, tx_hash
  ) VALUES (
    p_agent_id, p_client_address, p_feedback_index, v_next_index,
    p_responder, p_response_uri, p_response_hash, p_created_at, p_tx_hash
  )
  ON CONFLICT (agent_id, client_address, feedback_index, response_index) DO NOTHING;

  RETURN v_next_index;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_feedback_response(integer, text, bigint, text, text, text, timestamptz, text) FROM public;
GRANT EXECUTE ON FUNCTION public.insert_feedback_response(integer, text, bigint, text, text, text, timestamptz, text) TO service_role;

-- =============================================================================
-- #3 [HIGH] Partial index for resolve_uri_pending (async URI cron)
-- The resolve-uris Edge Function queries WHERE resolve_uri_pending = true.
-- Without an index, this is a full table scan on every cron tick.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agents_pending_uri
  ON public.agents (id)
  WHERE resolve_uri_pending = true;

-- =============================================================================
-- #4 [HIGH] Index for feedback_responses ordered by agent + created_at
-- Agent detail page queries: WHERE agent_id = X ORDER BY created_at DESC.
-- Existing idx_feedback_responses_lookup is (agent_id, client_address, feedback_index)
-- which doesn't cover the ORDER BY created_at sort.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_feedback_responses_agent_created
  ON public.feedback_responses (agent_id, created_at DESC);

-- =============================================================================
-- #5 [MEDIUM] Lock stale threshold 60s → 180s
-- Indexer timeout is 120s. If a run takes >60s but <120s, the lock could be
-- falsely cleaned by a concurrent call. Threshold must exceed the timeout.
-- =============================================================================

CREATE OR REPLACE FUNCTION acquire_indexer_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $$
DECLARE
  v_stale_threshold interval := interval '180 seconds';
BEGIN
  DELETE FROM public.indexer_locks
  WHERE lock_name = 'indexer'
    AND acquired_at < now() - v_stale_threshold;

  INSERT INTO public.indexer_locks (lock_name)
  VALUES ('indexer')
  ON CONFLICT (lock_name) DO NOTHING;

  RETURN FOUND;
END;
$$;

-- Re-grant after CREATE OR REPLACE
REVOKE EXECUTE ON FUNCTION acquire_indexer_lock() FROM public;
GRANT EXECUTE ON FUNCTION acquire_indexer_lock() TO service_role;

-- =============================================================================
-- #6 [MEDIUM] Enable pg_stat_statements for query monitoring
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- =============================================================================
-- #8 [LOW] Enable RLS on indexer_locks (defense-in-depth)
-- Privileges are already revoked from public, but RLS adds another layer.
-- =============================================================================

ALTER TABLE public.indexer_locks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- #9 [LOW] Autovacuum tuning for high-churn indexer tables
-- feedback and feedback_responses receive frequent upserts.
-- Lower the scale factor so autovacuum kicks in sooner.
-- =============================================================================

ALTER TABLE public.feedback SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE public.feedback_responses SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- =============================================================================
-- #10 [LOW] CHECK constraints on address columns
-- Stellar addresses are 56 chars (G... public keys). Allow up to 256 for
-- contract addresses (C...) and future formats.
-- =============================================================================

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_owner_length;
ALTER TABLE public.agents
  ADD CONSTRAINT agents_owner_length
  CHECK (char_length(owner) <= 256);

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_wallet_length;
ALTER TABLE public.agents
  ADD CONSTRAINT agents_wallet_length
  CHECK (wallet IS NULL OR char_length(wallet) <= 256);

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_client_address_length;
ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_client_address_length
  CHECK (char_length(client_address) <= 256);

ALTER TABLE public.feedback_responses
  DROP CONSTRAINT IF EXISTS feedback_responses_client_address_length;
ALTER TABLE public.feedback_responses
  ADD CONSTRAINT feedback_responses_client_address_length
  CHECK (char_length(client_address) <= 256);

ALTER TABLE public.feedback_responses
  DROP CONSTRAINT IF EXISTS feedback_responses_responder_length;
ALTER TABLE public.feedback_responses
  ADD CONSTRAINT feedback_responses_responder_length
  CHECK (char_length(responder) <= 256);

ALTER TABLE public.validations
  DROP CONSTRAINT IF EXISTS validations_validator_address_length;
ALTER TABLE public.validations
  ADD CONSTRAINT validations_validator_address_length
  CHECK (char_length(validator_address) <= 256);
