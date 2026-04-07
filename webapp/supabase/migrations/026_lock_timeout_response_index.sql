-- 026_lock_timeout_response_index.sql
-- Add an explicit lock_timeout to insert_feedback_response so a stalled
-- holder of the advisory lock cannot wedge the indexer indefinitely. The
-- function-level statement_timeout (10s, set in migration 021) bounds the
-- total runtime, but lock_timeout makes the failure mode faster and more
-- specific: we get a clean lock-acquire timeout instead of a 10s stall on
-- every concurrent caller.

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
BEGIN
  -- Serialize concurrent calls for the same (agent_id, client_address, feedback_index) tuple.
  -- Advisory lock is transaction-scoped: auto-released on commit/rollback.
  -- lock_timeout = 5s means: if another session holds the lock for too long,
  -- raise lock_not_available (SQLSTATE 55P03) and let the caller retry,
  -- rather than blocking up to statement_timeout.
  PERFORM pg_advisory_xact_lock(
    p_agent_id,
    hashtext(p_client_address || ':' || p_feedback_index::text)
  );

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
