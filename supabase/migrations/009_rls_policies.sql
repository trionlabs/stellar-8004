-- 009_rls_policies.sql
-- Row Level Security: public read, service_role write
-- Note: No DELETE policies - agents are immutable on-chain, deletions never happen

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

CREATE POLICY "Indexer can insert agents"
  ON agents FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Indexer can update agents"
  ON agents FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "Indexer can insert agent_metadata"
  ON agent_metadata FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Indexer can update agent_metadata"
  ON agent_metadata FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "Indexer can insert feedback"
  ON feedback FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Indexer can update feedback"
  ON feedback FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "Indexer can insert feedback_responses"
  ON feedback_responses FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Indexer can insert validations"
  ON validations FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Indexer can update validations"
  ON validations FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "Indexer can read state"
  ON indexer_state FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY "Indexer can insert state"
  ON indexer_state FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Indexer can update state"
  ON indexer_state FOR UPDATE USING (auth.role() = 'service_role');
