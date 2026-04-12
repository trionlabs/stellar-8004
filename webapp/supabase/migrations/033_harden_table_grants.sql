-- 033_harden_table_grants.sql
--
-- Defense-in-depth: remove write grants from anon/authenticated roles.
--
-- RLS already blocks writes (no INSERT/UPDATE/DELETE policies exist),
-- but table-level REVOKE adds a second layer. If someone accidentally
-- adds a permissive write policy, the REVOKE still blocks the operation.
--
-- service_role bypasses both RLS and grants, so the indexer is unaffected.
--
-- Also enables RLS on public.schema_migrations which was created by the
-- migrate container outside of Supabase's migration system.

-- Enable RLS on schema_migrations (anon can currently INSERT into it)
ALTER TABLE IF EXISTS public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- Revoke write privileges from anon/authenticated on all application tables
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.agents,
  public.agent_metadata,
  public.feedback,
  public.feedback_responses,
  public.validations,
  public.indexer_state,
  public.indexer_locks,
  public.schema_migrations
FROM anon, authenticated;
