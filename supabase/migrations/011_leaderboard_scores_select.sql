-- 011_leaderboard_scores_select.sql
-- Public web pages read from the leaderboard_scores materialized view.
-- Materialized views are exposed via explicit grants instead of RLS policies.

GRANT SELECT ON TABLE public.leaderboard_scores TO anon, authenticated;
