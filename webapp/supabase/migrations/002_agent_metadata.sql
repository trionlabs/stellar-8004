-- 002_agent_metadata.sql
-- On-chain key-value metadata for agents

CREATE TABLE agent_metadata (
  agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  PRIMARY KEY (agent_id, key)
);

COMMENT ON TABLE agent_metadata IS 'Arbitrary on-chain metadata set via Identity Registry setMetadata()';
COMMENT ON COLUMN agent_metadata.value IS 'Metadata value - on-chain Bytes decoded to text (UTF-8 or hex-encoded)';
