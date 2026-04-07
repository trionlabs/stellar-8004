-- 021_fix_response_index_concurrency.sql
-- Fix: FOR UPDATE + MAX() is invalid PostgreSQL (ERROR: FOR UPDATE is not
-- allowed with aggregate functions). This has been silently broken since
-- migration 013. Replace with pg_advisory_xact_lock to serialize concurrent
-- calls for the same (agent_id, feedback_index) tuple.

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
  -- Serialize concurrent calls for the same (agent_id, client_address, feedback_index) tuple.
  -- Advisory lock is transaction-scoped: auto-released on commit/rollback.
  -- This replaces the invalid FOR UPDATE + MAX() pattern from migrations 013/017.
  -- Two-argument form gives 64-bit key space, avoiding hashtext 32-bit collisions.
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
