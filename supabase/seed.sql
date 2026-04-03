-- Seed indexer_state with initial rows for each contract.
INSERT INTO indexer_state (id, last_ledger, updated_at)
VALUES
  ('identity', 0, now()),
  ('reputation', 0, now()),
  ('validation', 0, now())
ON CONFLICT (id) DO NOTHING;
