-- Add expected_next_ledger column to indexer_state for gap detection
ALTER TABLE indexer_state
  ADD COLUMN IF NOT EXISTS expected_next_ledger bigint;
