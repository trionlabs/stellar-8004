-- 041_lock_release_fence_and_event_id_idempotency.sql
--
-- Two concurrency-correctness fixes on top of migration 038:
--
--   1. Tighten release_indexer_lock. 038 used
--      `(p_owner IS NULL OR owner IS NOT DISTINCT FROM p_owner)`, so a caller
--      that passed no owner (NULL) performed an UNCONDITIONAL delete and could
--      wipe a live, differently-owned lock (e.g. the backfill script vs the
--      cron indexer). Drop the NULL short-circuit: a release now only deletes
--      the row it owns (NULL matches NULL via IS NOT DISTINCT FROM). The 180s
--      stale-reaper in acquire still cleans orphaned/owner-mismatched locks.
--
--   2. Make insert_feedback_response idempotent on the GLOBALLY-UNIQUE Soroban
--      event id instead of tx_hash. tx_hash is not a unique event identity (a
--      transaction emits many events) and is nullable, so `tx_hash = p_tx_hash`
--      could (a) silently disable idempotency when NULL (NULL = NULL is never
--      true) and (b) collapse two distinct responses appended in one tx. The
--      event id (ledger-tx-op-event paging token) is unique per on-chain event,
--      so it is the correct idempotency key. A partial unique index enforces it
--      at the DB level as a backstop to the advisory-lock + SELECT path.

CREATE OR REPLACE FUNCTION release_indexer_lock(p_owner text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.indexer_locks
  WHERE lock_name = 'indexer'
    AND owner IS NOT DISTINCT FROM p_owner;
END;
$$;

REVOKE EXECUTE ON FUNCTION release_indexer_lock(text) FROM public;
GRANT EXECUTE ON FUNCTION release_indexer_lock(text) TO service_role;

-- Idempotency key column + backstop index.
ALTER TABLE feedback_responses ADD COLUMN IF NOT EXISTS event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS feedback_responses_event_id_key
  ON feedback_responses (event_id)
  WHERE event_id IS NOT NULL;

-- Adding p_event_id changes the function arity, which would otherwise create a
-- second overload. Drop the 8-arg signature from migration 038 first.
DROP FUNCTION IF EXISTS public.insert_feedback_response(
  integer, text, bigint, text, text, text, timestamptz, text
);

CREATE OR REPLACE FUNCTION public.insert_feedback_response(
  p_agent_id integer,
  p_client_address text,
  p_feedback_index bigint,
  p_responder text,
  p_response_uri text,
  p_response_hash text,
  p_created_at timestamptz,
  p_tx_hash text,
  p_event_id text DEFAULT NULL
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

  -- Idempotency on the unique on-chain event id: a replayed or concurrently
  -- re-processed event resolves to the existing row instead of double-counting.
  IF p_event_id IS NOT NULL THEN
    SELECT response_index
    INTO v_existing_index
    FROM public.feedback_responses
    WHERE event_id = p_event_id
    LIMIT 1;

    IF v_existing_index IS NOT NULL THEN
      RETURN v_existing_index;
    END IF;
  END IF;

  SELECT COALESCE(MAX(response_index), 0) + 1
  INTO v_next_index
  FROM public.feedback_responses
  WHERE agent_id = p_agent_id
    AND client_address = p_client_address
    AND feedback_index = p_feedback_index;

  INSERT INTO public.feedback_responses (
    agent_id, client_address, feedback_index, response_index,
    responder, response_uri, response_hash, created_at, tx_hash, event_id
  ) VALUES (
    p_agent_id, p_client_address, p_feedback_index, v_next_index,
    p_responder, p_response_uri, p_response_hash, p_created_at, p_tx_hash, p_event_id
  )
  ON CONFLICT (agent_id, client_address, feedback_index, response_index) DO NOTHING;

  RETURN v_next_index;

-- Backstop: if the event_id unique index races ahead of the SELECT above
-- (should not happen under the advisory lock), resolve to the existing row.
EXCEPTION WHEN unique_violation THEN
  SELECT response_index
  INTO v_existing_index
  FROM public.feedback_responses
  WHERE event_id = p_event_id
  LIMIT 1;
  RETURN v_existing_index;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_feedback_response(integer, text, bigint, text, text, text, timestamptz, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.insert_feedback_response(integer, text, bigint, text, text, text, timestamptz, text, text) TO service_role;
