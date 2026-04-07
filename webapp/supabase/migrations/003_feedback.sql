-- 003_feedback.sql
-- Reputation feedback from the Reputation Registry contract

CREATE TABLE feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  client_address text NOT NULL,
  feedback_index bigint NOT NULL,
  value numeric(39, 18) NOT NULL,
  value_decimals integer NOT NULL DEFAULT 0,
  tag1 text,
  tag2 text,
  endpoint text,
  feedback_uri text,
  feedback_hash text,
  is_revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_ledger bigint,
  tx_hash text,
  UNIQUE (agent_id, client_address, feedback_index)
);

CREATE INDEX idx_feedback_agent_id ON feedback (agent_id);
CREATE INDEX idx_feedback_tag1 ON feedback (tag1) WHERE NOT is_revoked;
CREATE INDEX idx_feedback_created_at ON feedback (created_at DESC);

COMMENT ON TABLE feedback IS 'Feedback entries from Stellar Reputation Registry';
COMMENT ON COLUMN feedback.value IS 'Signed score (i128 on-chain, supports negative). numeric(39,18) sufficient for practical score range, not full i128.';
COMMENT ON COLUMN feedback.feedback_index IS 'Per-client sequential index (1-based, u64 on-chain)';
