-- 035_fix_search_after_validation_drop.sql
-- Migration 034 dropped leaderboard_scores with CASCADE, which also dropped
-- search_agents_advanced() because its RETURN TABLE referenced validation_count
-- and avg_validation_score columns that no longer exist.
-- This migration recreates the function without those columns.

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
  unique_clients bigint
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
      ls.unique_clients
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

GRANT EXECUTE ON FUNCTION public.search_agents_advanced(text, text[], numeric, boolean, integer, integer, text)
  TO anon, authenticated;
