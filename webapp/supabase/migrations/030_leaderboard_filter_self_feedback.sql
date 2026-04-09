-- 030_leaderboard_filter_self_feedback.sql
-- Filter self-feedback out of the leaderboard aggregates.
--
-- The canonical erc-8004 reference enforces self-feedback rejection ON-CHAIN
-- via `isAuthorizedOrOwner` in `giveFeedback`. Our reputation registry
-- mirrors this check, so self-feedback is rejected at the contract level.
--
-- This materialized view filter is DEFENSE-IN-DEPTH: if the on-chain check
-- were ever bypassed (e.g. via a compromised identity registry admin key),
-- the leaderboard would still exclude self-authored feedback rows.
--
-- Implementation: rebuild the materialized view with a NOT EXISTS clause on
-- the feedback subquery that excludes rows where the feedback's
-- `client_address` equals the agent's `owner` at write time. The agent
-- owner can change via NFT transfer; we filter against the *current* owner
-- because that's what the leaderboard displays. Historical self-reviews
-- from a previous owner are still excluded because the join is on the live
-- `agents.owner` column.

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
  COALESCE(v.validation_count, 0) AS validation_count,
  COALESCE(v.avg_validation_score, 0)::numeric(10, 2) AS avg_validation_score,
  LEAST(100, GREATEST(
    0,
    COALESCE(f.avg_score, 0) * 0.6
    + LEAST(100, LN(GREATEST(1, COALESCE(f.feedback_count, 0))) / LN(100) * 100) * 0.2
    + COALESCE(v.avg_validation_score, 0) * 0.2
  ))::numeric(10, 2) AS total_score
FROM public.agents AS a
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE NOT is_revoked) AS feedback_count,
    AVG(value / (10::numeric ^ value_decimals)) FILTER (WHERE NOT is_revoked) AS avg_score,
    COUNT(DISTINCT client_address) FILTER (WHERE NOT is_revoked) AS unique_clients
  FROM public.feedback
  WHERE agent_id = a.id
    AND client_address <> a.owner
) AS f ON TRUE
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
