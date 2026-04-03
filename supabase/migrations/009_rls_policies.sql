-- 009_rls_policies.sql
-- Row Level Security: public read, service_role writes
--
-- In Supabase, the service_role key BYPASSES RLS entirely.
-- We do NOT need INSERT/UPDATE/DELETE policies for the indexer -
-- service_role can always write regardless of policies.
--
-- Strategy:
--   RLS enabled + public SELECT policies = anon/authenticated can read
--   No INSERT/UPDATE policies = anon/authenticated cannot write
--   service_role bypasses RLS = indexer can read/write everything
--   indexer_state has no SELECT policy = only service_role can access it

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE indexer_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read agents"
  ON agents FOR SELECT USING (true);

CREATE POLICY "Anyone can read agent_metadata"
  ON agent_metadata FOR SELECT USING (true);

CREATE POLICY "Anyone can read feedback"
  ON feedback FOR SELECT USING (true);

CREATE POLICY "Anyone can read feedback_responses"
  ON feedback_responses FOR SELECT USING (true);

CREATE POLICY "Anyone can read validations"
  ON validations FOR SELECT USING (true);
