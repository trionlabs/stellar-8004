-- 040_drop_indexer_last_cursor.sql
--
-- Remove the dead `last_cursor` column. The indexer always resumes a contract
-- from `last_ledger + 1` (cursor-based resume was never implemented), so the
-- column was written on every checkpoint but never read back — misleading dead
-- state. Soroban getEvents pagination is monotonic and the writes are
-- idempotent upserts, so ledger-based resume is correct without it.

ALTER TABLE indexer_state DROP COLUMN IF EXISTS last_cursor;
