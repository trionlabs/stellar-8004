-- 005_validations.sql
-- Validation requests and responses from the Validation Registry contract

CREATE TABLE validations (
  request_hash text PRIMARY KEY,
  agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  validator_address text NOT NULL,
  request_uri text,
  response integer CHECK (response >= 0 AND response <= 100),
  response_uri text,
  response_hash text,
  tag text,
  has_response boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  request_tx_hash text,
  response_tx_hash text
);

CREATE INDEX idx_validations_agent_id ON validations (agent_id);
CREATE INDEX idx_validations_validator ON validations (validator_address);
CREATE INDEX idx_validations_pending ON validations (agent_id) WHERE NOT has_response;
CREATE INDEX idx_validations_created_at ON validations (created_at DESC);

COMMENT ON TABLE validations IS 'Third-party validation records from Stellar Validation Registry';
COMMENT ON COLUMN validations.request_hash IS 'BytesN<32> hex - caller-provided unique ID passed to validation_request(), emitted in ValidationRequested event. Collision: impossible if callers use proper hashing.';
COMMENT ON COLUMN validations.response IS 'Validator score 0-100 (null if not yet responded)';
COMMENT ON COLUMN validations.request_tx_hash IS 'Transaction hash of ValidationRequested';
COMMENT ON COLUMN validations.response_tx_hash IS 'Transaction hash of ValidationResponded';
