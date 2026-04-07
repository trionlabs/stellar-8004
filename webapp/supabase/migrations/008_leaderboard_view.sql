-- 008_leaderboard_view.sql
-- Pre-computed leaderboard scores (global only - tag-based filtering is v2)
-- NOTE: Composite score formula assumes avg_score is on a 0-100 scale after
-- decimal normalization (value / 10^value_decimals). The contract does NOT
-- enforce this range - out-of-range values are clamped by LEAST/GREATEST.
-- If feedback scoring conventions change, this formula needs adjustment.

CREATE MATERIALIZED VIEW leaderboard_scores AS
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
FROM agents a
LEFT JOIN (
  SELECT
    agent_id,
    COUNT(*) FILTER (WHERE NOT is_revoked) AS feedback_count,
    AVG(value / POWER(10, value_decimals)) FILTER (WHERE NOT is_revoked) AS avg_score,
    COUNT(DISTINCT client_address) FILTER (WHERE NOT is_revoked) AS unique_clients
  FROM feedback
  GROUP BY agent_id
) f ON f.agent_id = a.id
LEFT JOIN (
  SELECT
    agent_id,
    COUNT(*) FILTER (WHERE has_response) AS validation_count,
    AVG(response) FILTER (WHERE has_response) AS avg_validation_score
  FROM validations
  GROUP BY agent_id
) v ON v.agent_id = a.id;

CREATE UNIQUE INDEX leaderboard_scores_agent_id_idx ON leaderboard_scores (agent_id);
CREATE INDEX idx_leaderboard_total_score ON leaderboard_scores (total_score DESC);

CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_scores;
END;
$$;

-- REVOKE FROM public covers anon/authenticated (they inherit from public)
REVOKE EXECUTE ON FUNCTION refresh_leaderboard() FROM public;
GRANT EXECUTE ON FUNCTION refresh_leaderboard() TO service_role;
