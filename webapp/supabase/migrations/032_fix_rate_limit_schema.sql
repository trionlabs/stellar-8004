-- 032_fix_rate_limit_schema.sql
--
-- Fix: check_rate_limit() referenced public.api_rate_limits but the table
-- lives in private.api_rate_limits (created in 024). The schema mismatch
-- caused every RPC call to fail silently (rate-limit.ts swallows the error),
-- leaving the API effectively unrate-limited.
--
-- Changes:
--   1. Point INSERT/SELECT at private.api_rate_limits
--   2. Add SECURITY DEFINER so the anon role (PostgREST) can reach private schema
--   3. Restrict search_path to prevent privilege escalation via SECURITY DEFINER

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
  cnt bigint;
BEGIN
  INSERT INTO private.api_rate_limits (ip, requested_at) VALUES (p_ip::inet, now());

  SELECT count(*) INTO cnt
  FROM private.api_rate_limits
  WHERE ip = p_ip::inet AND requested_at >= window_start;

  RETURN QUERY SELECT (cnt <= p_limit_per_minute), cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer) TO anon, authenticated;
