-- 049_rate_limit_fail_closed.sql
--
-- Hardens public.check_rate_limit against two audit findings:
--
--   1. FAIL-OPEN on a bad key. The edge caller derives an IP key that can be a
--      non-IP value ('unknown', a spoofed/garbage X-Forwarded-For, or an empty
--      header). `p_ip::inet` then raises invalid_text_representation, which the
--      caller (_shared/rate-limit.ts) swallows and returns allowed:true —
--      bypassing rate limiting entirely. Guard the cast so an unparseable key is
--      funnelled to a single shared sentinel bucket and still counts (fail CLOSED).
--
--   2. UNAUTHENTICATED INSERT primitive. The function was EXECUTE-granted to
--      anon/authenticated (032) and is SECURITY DEFINER, so it was directly
--      callable over PostgREST as an unauthenticated INSERT into private. The
--      edge API authenticates with the service_role key (createSupabaseAdmin),
--      so anon/authenticated never need it. Revoke them (and the implicit PUBLIC
--      grant) and grant only service_role.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip text,
  p_limit_per_minute integer DEFAULT 30
)
RETURNS TABLE (allowed boolean, current_count bigint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '2s'
AS $$
DECLARE
  window_start timestamptz := now() - interval '60 seconds';
  v_ip inet;
  cnt bigint;
BEGIN
  -- Fail CLOSED on an unparseable key: count it toward one shared sentinel
  -- bucket instead of letting the cast raise (which would bypass the limiter).
  BEGIN
    v_ip := p_ip::inet;
  EXCEPTION WHEN others THEN
    v_ip := '0.0.0.0'::inet;
  END;

  INSERT INTO private.api_rate_limits (ip, requested_at) VALUES (v_ip, now());

  SELECT count(*) INTO cnt
  FROM private.api_rate_limits
  WHERE ip = v_ip AND requested_at >= window_start;

  RETURN QUERY SELECT (cnt <= p_limit_per_minute), cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer) TO service_role;
