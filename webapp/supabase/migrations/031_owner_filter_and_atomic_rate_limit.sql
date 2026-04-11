-- 031_owner_filter_and_atomic_rate_limit.sql
-- 1. Add owner_filter param to search_agents and search_agents_advanced
-- 2. Replace rate limit insert+count with an atomic SQL function

-- ---------- search_agents with owner filter ----------

CREATE OR REPLACE FUNCTION public.search_agents(
  search_query text,
  result_limit integer DEFAULT 20,
  result_offset integer DEFAULT 0,
  owner_filter text DEFAULT NULL
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
      WHERE (owner_filter IS NULL OR owner = owner_filter)
      ORDER BY created_at DESC
      LIMIT result_limit
      OFFSET result_offset;
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.agents
      WHERE search_vector @@ plainto_tsquery('english', search_query)
        AND (owner_filter IS NULL OR owner = owner_filter)
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', search_query)) DESC
      LIMIT result_limit
      OFFSET result_offset;
  END IF;
END;
$$;

-- ---------- search_agents_advanced with owner filter ----------

CREATE OR REPLACE FUNCTION public.search_agents_advanced(
  search_query text DEFAULT '',
  trust_filter text[] DEFAULT '{}',
  min_score numeric DEFAULT 0,
  has_services_filter boolean DEFAULT NULL,
  result_limit integer DEFAULT 20,
  result_offset integer DEFAULT 0,
  owner_filter text DEFAULT NULL
)
RETURNS TABLE (
  agent_id integer,
  agent_name text,
  agent_image text,
  owner text,
  supported_trust text[],
  has_services boolean,
  total_score numeric,
  avg_score numeric,
  feedback_count bigint,
  unique_clients bigint,
  validation_count bigint,
  avg_validation_score numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
SET statement_timeout = '5s'
AS $$
BEGIN
  result_limit := LEAST(GREATEST(COALESCE(result_limit, 20), 1), 100);
  result_offset := GREATEST(COALESCE(result_offset, 0), 0);
  min_score := GREATEST(COALESCE(min_score, 0), 0);

  RETURN QUERY
    SELECT
      ls.agent_id,
      ls.agent_name,
      ls.agent_image,
      ls.owner,
      ls.supported_trust,
      ls.has_services,
      ls.total_score,
      ls.avg_score,
      ls.feedback_count,
      ls.unique_clients,
      ls.validation_count,
      ls.avg_validation_score
    FROM public.leaderboard_scores AS ls
    WHERE
      (search_query = '' OR search_query IS NULL OR EXISTS (
        SELECT 1
        FROM public.agents AS a
        WHERE a.id = ls.agent_id
          AND a.search_vector @@ plainto_tsquery('english', search_query)
      ))
      AND (
        cardinality(COALESCE(trust_filter, '{}'::text[])) = 0
        OR ls.supported_trust && COALESCE(trust_filter, '{}'::text[])
      )
      AND ls.total_score >= min_score
      AND (has_services_filter IS NULL OR ls.has_services = has_services_filter)
      AND (owner_filter IS NULL OR ls.owner = owner_filter)
    ORDER BY ls.total_score DESC, ls.agent_id ASC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_agents(text, integer, integer, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_agents_advanced(text, text[], numeric, boolean, integer, integer, text)
  TO anon, authenticated;

-- ---------- Atomic rate limit ----------

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip text,
  p_limit_per_minute integer DEFAULT 30
)
RETURNS TABLE (allowed boolean, current_count bigint)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
SET statement_timeout = '2s'
AS $$
DECLARE
  window_start timestamptz := now() - interval '60 seconds';
  cnt bigint;
BEGIN
  INSERT INTO public.api_rate_limits (ip, requested_at) VALUES (p_ip, now());

  SELECT count(*) INTO cnt
  FROM public.api_rate_limits
  WHERE ip = p_ip AND requested_at >= window_start;

  RETURN QUERY SELECT (cnt <= p_limit_per_minute), cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer) TO anon, authenticated;
