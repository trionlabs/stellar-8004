-- 042_leaderboard_overflow_and_refresh_throttle.sql
--
-- Two leaderboard fixes:
--
-- 1. NUMERIC OVERFLOW (permanent-freeze DoS). Migration 034 casts avg_score
--    and total_score to numeric(10,2) (max 99,999,999.99). The reputation
--    contract allows a feedback value up to MAX_ABS_VALUE = 1e20 with
--    value_decimals as low as 0, so a single in-protocol feedback can make
--    `AVG(value / 10^value_decimals)` ~1e20 (21 integer digits). That casts to
--    numeric(10,2) -> SQLSTATE 22003 numeric_field_overflow INSIDE
--    `REFRESH MATERIALIZED VIEW CONCURRENTLY`. The indexer advances its
--    checkpoint BEFORE refreshing, so the offending feedback is permanently
--    consumed and every subsequent refresh re-hits the overflow -> the
--    leaderboard freezes forever. Fix: widen the cast to numeric(40,2)
--    (38 integer digits, comfortably above the 1e20 bound).
--
-- 2. UNTHROTTLED FULL REFRESH (cost grows O(all agents + all feedback)). The
--    indexer calls refresh_leaderboard() on every 60s tick that processed any
--    reputation/validation event. Throttle it to at most once per window so a
--    busy stream can't trigger a full rebuild every minute. A separate
--    refresh_leaderboard_force() bypasses the throttle for the backfill's
--    one-shot final rebuild.
--
-- Widening the cast requires recreating the materialized view, which (like the
-- 034 -> 035 sequence) drops the dependent search_agents_advanced() function,
-- so this migration recreates it verbatim from migration 037 afterwards.

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
  COALESCE(f.avg_score, 0)::numeric(40, 2) AS avg_score,
  COALESCE(f.unique_clients, 0) AS unique_clients,
  COALESCE(f.avg_score, 0)::numeric(40, 2) AS total_score
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

-- Unique index is REQUIRED for REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX leaderboard_scores_agent_id_idx ON public.leaderboard_scores (agent_id);
CREATE INDEX idx_leaderboard_total_score ON public.leaderboard_scores (total_score DESC);
CREATE INDEX idx_leaderboard_supported_trust ON public.leaderboard_scores USING GIN (supported_trust);

-- Restore the locked-down grants from migration 036 (read-only for public roles).
REVOKE ALL ON public.leaderboard_scores FROM anon, authenticated;
GRANT SELECT ON public.leaderboard_scores TO anon, authenticated;

-- Recreate search_agents_advanced (verbatim from migration 037). The DROP ...
-- CASCADE above removes it along with the view; DROP IF EXISTS first makes this
-- robust whether or not CASCADE actually dropped it.
DROP FUNCTION IF EXISTS public.search_agents_advanced(text, text[], numeric, boolean, integer, integer, text);

CREATE FUNCTION public.search_agents_advanced(
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
  x402_enabled boolean,
  mpp_enabled boolean,
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
      a.x402_enabled,
      a.mpp_enabled,
      ls.total_score,
      ls.avg_score,
      ls.feedback_count,
      ls.unique_clients
    FROM public.leaderboard_scores AS ls
    JOIN public.agents AS a ON a.id = ls.agent_id
    WHERE
      (search_query = '' OR search_query IS NULL OR
        a.search_vector @@ plainto_tsquery('english', search_query)
      )
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

-- --- Refresh throttle ------------------------------------------------------

-- Single-row throttle state. Internal-only: accessed solely by the SECURITY
-- DEFINER refresh functions (which run as the definer, bypassing RLS), never
-- by anon/authenticated via PostgREST.
CREATE TABLE IF NOT EXISTS public.leaderboard_refresh_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_refreshed timestamptz NOT NULL DEFAULT 'epoch'
);
INSERT INTO public.leaderboard_refresh_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.leaderboard_refresh_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leaderboard_refresh_state FROM anon, authenticated;

-- Throttled refresh (called by the indexer every tick that saw a leaderboard
-- event). Keeps the same no-arg `RETURNS void` signature as migration 034 so
-- the existing `rpc('refresh_leaderboard')` caller is unchanged and there is no
-- PostgREST overload ambiguity.
CREATE OR REPLACE FUNCTION public.refresh_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '30s'
AS $$
DECLARE
  v_throttle constant interval := interval '2 minutes';
BEGIN
  -- Atomic claim: flip last_refreshed only if the throttle window has elapsed.
  -- The row lock serializes overlapping callers, and because the UPDATE and the
  -- REFRESH share one transaction, a failed REFRESH (e.g. statement_timeout)
  -- rolls the timestamp back so the throttle tracks the last SUCCESSFUL refresh.
  UPDATE public.leaderboard_refresh_state
  SET last_refreshed = now()
  WHERE id = true
    AND (now() - last_refreshed) >= v_throttle;

  IF NOT FOUND THEN
    RETURN; -- refreshed recently; skip the O(dataset) rebuild this tick.
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_scores;
END;
$$;

-- Unthrottled refresh for the backfill's one-shot final rebuild.
CREATE OR REPLACE FUNCTION public.refresh_leaderboard_force()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '60s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_scores;
  UPDATE public.leaderboard_refresh_state SET last_refreshed = now() WHERE id = true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_leaderboard() FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_leaderboard() TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_leaderboard_force() FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_leaderboard_force() TO service_role;
