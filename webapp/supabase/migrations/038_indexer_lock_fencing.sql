-- 038_indexer_lock_fencing.sql
--
-- Hardens the indexer concurrency guard against lock theft and makes the one
-- non-idempotent writer (insert_feedback_response) safe under accidental
-- concurrent passes.
--
-- Background: the indexer Edge Function has a 120s hard timeout (and pg_cron
-- fires it every 60s), but the stale-lock threshold in migration 012 was 60s.
-- A run that legitimately took 60-120s could therefore have its lock reaped by
-- the next invocation, producing two concurrent passes. The edge handler's
-- Promise.race timeout also abandons (does not cancel) runIndexer, so a slow
-- run can keep writing after the HTTP response returns. Fixes:
--
--   1. Stale threshold raised to 180s (> the 120s timeout) so a run that
--      respects its timeout is never reaped mid-flight.
--   2. Owner-fenced release: acquire stamps an owner token on the lock row and
--      release only deletes the row it owns. A reaped-then-finished "zombie"
--      run can no longer delete a successor's freshly-acquired lock.
--   3. insert_feedback_response is made idempotent on the on-chain event
--      identity (tx_hash) so that even if two passes process the same
--      ResponseAppended event, only one feedback_responses row is created
--      (the MAX(response_index)+1 derivation would otherwise insert two rows
--      with different response_index values that ON CONFLICT cannot dedupe).

ALTER TABLE indexer_locks ADD COLUMN IF NOT EXISTS owner text;

-- Drop the zero-arg signatures from migration 012. In PostgreSQL,
-- `acquire_indexer_lock()` and `acquire_indexer_lock(text)` are DISTINCT
-- overloads, so without this drop the old functions would linger and a no-arg
-- call would become ambiguous ("function is not unique"). Dropping also
-- removes their grants cleanly.
DROP FUNCTION IF EXISTS acquire_indexer_lock();
DROP FUNCTION IF EXISTS release_indexer_lock();

-- p_owner defaults to NULL to stay backward compatible with any caller that
-- invokes the lock functions without arguments (release with NULL owner falls
-- back to the previous unconditional delete).
CREATE OR REPLACE FUNCTION acquire_indexer_lock(p_owner text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $$
DECLARE
  v_stale_threshold interval := interval '180 seconds';
BEGIN
  -- Clean up stale locks first (crash recovery). The threshold must exceed the
  -- Edge Function's hard timeout so a healthy run is never reaped mid-flight.
  DELETE FROM public.indexer_locks
  WHERE lock_name = 'indexer'
    AND acquired_at < now() - v_stale_threshold;

  INSERT INTO public.indexer_locks (lock_name, owner, acquired_at)
  VALUES ('indexer', p_owner, now())
  ON CONFLICT (lock_name) DO NOTHING;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION release_indexer_lock(p_owner text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.indexer_locks
  WHERE lock_name = 'indexer'
    AND (p_owner IS NULL OR owner IS NOT DISTINCT FROM p_owner);
END;
$$;

REVOKE EXECUTE ON FUNCTION acquire_indexer_lock(text) FROM public;
GRANT EXECUTE ON FUNCTION acquire_indexer_lock(text) TO service_role;

REVOKE EXECUTE ON FUNCTION release_indexer_lock(text) FROM public;
GRANT EXECUTE ON FUNCTION release_indexer_lock(text) TO service_role;

-- Make response insertion idempotent on the on-chain event identity. Two
-- concurrent passes (or a replayed batch) processing the same ResponseAppended
-- event now resolve to the same row instead of double-counting.
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
SET lock_timeout = '5s'
AS $$
DECLARE
  v_next_index integer;
  v_existing_index integer;
BEGIN
  -- Serialize concurrent calls for the same (agent_id, client_address,
  -- feedback_index) tuple. Advisory lock is transaction-scoped.
  PERFORM pg_advisory_xact_lock(
    p_agent_id,
    hashtext(p_client_address || ':' || p_feedback_index::text)
  );

  -- Idempotency: if this exact on-chain event (tx_hash) was already recorded
  -- for the tuple, return its existing index instead of inserting a duplicate.
  SELECT response_index
  INTO v_existing_index
  FROM public.feedback_responses
  WHERE agent_id = p_agent_id
    AND client_address = p_client_address
    AND feedback_index = p_feedback_index
    AND tx_hash = p_tx_hash
  LIMIT 1;

  IF v_existing_index IS NOT NULL THEN
    RETURN v_existing_index;
  END IF;

  SELECT COALESCE(MAX(response_index), 0) + 1
  INTO v_next_index
  FROM public.feedback_responses
  WHERE agent_id = p_agent_id
    AND client_address = p_client_address
    AND feedback_index = p_feedback_index;

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
