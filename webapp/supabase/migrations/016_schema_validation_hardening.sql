-- Schema hardening and parser-aligned validation constraints.

DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_scores CASCADE;

ALTER TABLE public.feedback
  ALTER COLUMN value TYPE numeric(78, 0)
  USING value::numeric(78, 0);

COMMENT ON COLUMN public.feedback.value IS 'Signed score (i128 on-chain, supports negative). Stored as numeric(78,0) to preserve the full i128 range; value_decimals is applied at query time.';

ALTER TABLE public.validations
  DROP CONSTRAINT IF EXISTS validations_response_check;

ALTER TABLE public.validations
  DROP CONSTRAINT IF EXISTS validations_response_range;

ALTER TABLE public.validations
  ADD CONSTRAINT validations_response_range
  CHECK (response IS NULL OR (response >= 0 AND response <= 100));

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_value_decimals_range;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_value_decimals_range
  CHECK (value_decimals >= 0 AND value_decimals <= 18);

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_index_positive;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_index_positive
  CHECK (feedback_index >= 1);

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_id_positive;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_id_positive
  CHECK (id >= 0);

CREATE MATERIALIZED VIEW public.leaderboard_scores AS
SELECT
  a.id AS agent_id,
  a.agent_uri_data->>'name' AS agent_name,
  a.agent_uri_data->>'image' AS agent_image,
  a.owner,
  COALESCE(f.feedback_count, 0) AS feedback_count,
  COALESCE(f.avg_score, 0)::numeric(10, 2) AS avg_score,
  COALESCE(f.unique_clients, 0) AS unique_clients,
  COALESCE(v.validation_count, 0) AS validation_count,
  COALESCE(v.avg_validation_score, 0)::numeric(10, 2) AS avg_validation_score,
  LEAST(100, GREATEST(
    0,
    COALESCE(f.avg_score, 0) * 0.6
    + LEAST(100, LN(GREATEST(1, COALESCE(f.feedback_count, 0))) / LN(100) * 100) * 0.2
    + COALESCE(v.avg_validation_score, 0) * 0.2
  ))::numeric(10, 2) AS total_score
FROM public.agents AS a
LEFT JOIN (
  SELECT
    agent_id,
    COUNT(*) FILTER (WHERE NOT is_revoked) AS feedback_count,
    AVG(value / (10::numeric ^ value_decimals)) FILTER (WHERE NOT is_revoked) AS avg_score,
    COUNT(DISTINCT client_address) FILTER (WHERE NOT is_revoked) AS unique_clients
  FROM public.feedback
  GROUP BY agent_id
) AS f ON f.agent_id = a.id
LEFT JOIN (
  SELECT
    agent_id,
    COUNT(*) FILTER (WHERE has_response) AS validation_count,
    AVG(response) FILTER (WHERE has_response) AS avg_validation_score
  FROM public.validations
  GROUP BY agent_id
) AS v ON v.agent_id = a.id;

CREATE UNIQUE INDEX leaderboard_scores_agent_id_idx ON public.leaderboard_scores (agent_id);
CREATE INDEX idx_leaderboard_total_score ON public.leaderboard_scores (total_score DESC);

GRANT SELECT ON TABLE public.leaderboard_scores TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '30s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_scores;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_leaderboard() FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_leaderboard() TO service_role;

CREATE OR REPLACE FUNCTION public.search_agents(
  search_query text,
  result_limit integer DEFAULT 20,
  result_offset integer DEFAULT 0
)
RETURNS SETOF public.agents
LANGUAGE plpgsql
STABLE
SET search_path = ''
SET statement_timeout = '5s'
AS $$
BEGIN
  result_limit := LEAST(GREATEST(COALESCE(result_limit, 20), 1), 100);
  result_offset := GREATEST(COALESCE(result_offset, 0), 0);

  IF search_query = '' OR search_query IS NULL THEN
    RETURN QUERY
      SELECT *
      FROM public.agents
      ORDER BY created_at DESC
      LIMIT result_limit
      OFFSET result_offset;
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.agents
      WHERE search_vector @@ plainto_tsquery('english', search_query)
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', search_query)) DESC
      LIMIT result_limit
      OFFSET result_offset;
  END IF;
END;
$$;

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

ALTER PUBLICATION supabase_realtime SET TABLE
  public.agents (id, owner, agent_uri, agent_uri_data, wallet, created_at, updated_at),
  public.feedback (
    id, agent_id, client_address, feedback_index, value, value_decimals,
    tag1, tag2, endpoint, feedback_uri, feedback_hash, is_revoked, created_at
  ),
  public.validations (
    request_hash, agent_id, validator_address, request_uri, response,
    response_uri, response_hash, tag, has_response, created_at, responded_at
  );
