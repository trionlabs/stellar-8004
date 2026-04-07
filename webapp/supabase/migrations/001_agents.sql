-- 001_agents.sql
-- Agent registrations from the Identity Registry contract

CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

CREATE TABLE agents (
  id integer PRIMARY KEY,
  owner text NOT NULL,
  agent_uri text,
  agent_uri_data jsonb,
  wallet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_ledger bigint,
  tx_hash text
);

CREATE TRIGGER set_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE INDEX idx_agents_owner ON agents (owner);
CREATE INDEX idx_agents_created_at ON agents (created_at DESC);

COMMENT ON TABLE agents IS 'Agent registrations from Stellar Identity Registry';
COMMENT ON COLUMN agents.id IS 'On-chain token ID (sequential u32 - integer sufficient for practical range)';
COMMENT ON COLUMN agents.agent_uri_data IS 'Resolved JSON from agent_uri (name, description, image, services)';
COMMENT ON COLUMN agents.updated_at IS 'Auto-updated via moddatetime trigger on any row change';
