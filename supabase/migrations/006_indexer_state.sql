-- 006_indexer_state.sql
-- Tracks last processed ledger per contract for incremental indexing

CREATE TABLE indexer_state (
  id text PRIMARY KEY,
  last_ledger bigint NOT NULL DEFAULT 0,
  last_cursor text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO indexer_state (id, last_ledger) VALUES
  ('identity', 0),
  ('reputation', 0),
  ('validation', 0)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE indexer_state IS 'Indexer checkpoint - last processed ledger per contract';
