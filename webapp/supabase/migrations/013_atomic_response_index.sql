-- Atomic response_index derivation + insert for ResponseAppended events
-- NOTE: This migration's FOR UPDATE on an aggregate is invalid Postgres -
-- see migration 021 for the working pg_advisory_xact_lock fix.

CREATE OR REPLACE FUNCTION insert_feedback_response(
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

-- Least privilege: only service_role (indexer) can call this
REVOKE EXECUTE ON FUNCTION insert_feedback_response(integer, text, bigint, text, text, text, timestamptz, text) FROM public;
GRANT EXECUTE ON FUNCTION insert_feedback_response(integer, text, bigint, text, text, text, timestamptz, text) TO service_role;
