-- 034_leaderboard_drop_validation_scoring.sql
-- Remove the composite scoring formula and validation columns.
--
-- The previous leaderboard computed a weighted composite:
--   avg_feedback * 0.6 + volume_factor * 0.2 + avg_validation * 0.2
--
-- That formula was invented for the explorer UI and has no basis in the
-- 8004 spec. With validation removed from the frontend, total_score now
-- equals the on-chain get_summary average (avg_score) directly.
-- No volume weighting, no validation weighting — just the plain average
-- of non-revoked, non-self feedback scores.

DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_scores CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard_scores AS
SELECT
  a.id AS agent_id,
  a.agent_uri_data->>'name' AS agent_name,
  a.agent_uri_data->>'image' AS agent_image,
  a.owner,
  a.supported_trust,
  (jsonb_array_length(COALESCE(a.services, '[]'::jsonb)) > 0) AS has_services,
  COALESCE(f.feedback_count, 0) AS feedback_count,
  COALESCE(f.avg_score, 0)::numeric(10, 2) AS avg_score,
  COALESCE(f.unique_clients, 0) AS unique_clients,
  COALESCE(f.avg_score, 0)::numeric(10, 2) AS total_score
FROM public.agents AS a
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE NOT is_revoked) AS feedback_count,
    AVG(value / (10::numeric ^ value_decimals)) FILTER (WHERE NOT is_revoked) AS avg_score,
    COUNT(DISTINCT client_address) FILTER (WHERE NOT is_revoked) AS unique_clients
  FROM public.feedback
  WHERE agent_id = a.id
    AND client_address <> a.owner
) AS f ON TRUE;

CREATE UNIQUE INDEX leaderboard_scores_agent_id_idx ON public.leaderboard_scores (agent_id);
CREATE INDEX idx_leaderboard_total_score ON public.leaderboard_scores (total_score DESC);
CREATE INDEX idx_leaderboard_supported_trust ON public.leaderboard_scores USING GIN (supported_trust);

GRANT SELECT ON TABLE public.leaderboard_scores TO anon, authenticated;

-- Recreate refresh function (CASCADE above dropped it).
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
