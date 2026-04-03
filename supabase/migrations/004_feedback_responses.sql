-- 004_feedback_responses.sql
-- Responses appended to feedback entries

CREATE TABLE feedback_responses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  client_address text NOT NULL,
  feedback_index bigint NOT NULL,
  response_index integer NOT NULL,
  responder text NOT NULL,
  response_uri text,
  response_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  tx_hash text,
  UNIQUE (agent_id, client_address, feedback_index, response_index),
  FOREIGN KEY (agent_id, client_address, feedback_index)
    REFERENCES feedback (agent_id, client_address, feedback_index)
    ON DELETE CASCADE
);

CREATE INDEX idx_feedback_responses_lookup
  ON feedback_responses (agent_id, client_address, feedback_index);
CREATE INDEX idx_feedback_responses_created_at
  ON feedback_responses (created_at DESC);

COMMENT ON TABLE feedback_responses IS 'Responses to feedback via Reputation Registry appendResponse()';
COMMENT ON COLUMN feedback_responses.response_index IS 'Not emitted in ResponseAppended event - indexer must derive by counting existing responses per feedback entry before inserting';
