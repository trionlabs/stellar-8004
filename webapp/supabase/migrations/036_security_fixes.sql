-- 036_security_fixes.sql
--
-- Fix two Supabase Studio security warnings:
-- 1. cleanup_api_rate_limits has mutable search_path (SECURITY DEFINER)
-- 2. leaderboard_scores materialized view has excessive grants

-- Fix 1: Pin search_path on SECURITY DEFINER function
CREATE OR REPLACE FUNCTION private.cleanup_api_rate_limits()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = ''
AS $$
  DELETE FROM private.api_rate_limits
  WHERE requested_at < now() - interval '10 minutes';
$$;

-- Fix 2: Restrict leaderboard_scores to SELECT only
REVOKE ALL ON public.leaderboard_scores FROM anon, authenticated;
GRANT SELECT ON public.leaderboard_scores TO anon, authenticated;