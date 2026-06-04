-- 048_g1_registry_keying_phase_a.sql
-- G1 (Phase A of 5): registry-address composite keying — ADDITIVE, zero-risk.
--
-- WHY: agents + all reputation tables key on the bare on-chain `agent_id`
-- (integer), with no registry scoping. A fresh identity-registry deployment
-- restarts token ids at 1, so new agent #1 collides with the old deployment's
-- agent #1 — which is why README's "After redeploying" currently TRUNCATEs all
-- reputation history. G1 makes the key composite on (registry_address, id) so
-- multiple registry deployments coexist and history is permanent/portable
-- (8004's append-only/portable-reputation promise; see README.md design note).
--
-- THIS MIGRATION IS PURELY ADDITIVE. It does NOT change any primary key, foreign
-- key, or existing unique constraint, and it does NOT touch read queries or the
-- leaderboard view. It only:
--   (1) adds `registry_address` to agents + the 4 child tables (NOT NULL with a
--       constant DEFAULT of the live mainnet identity registry, so every existing
--       prod row is backfilled in one metadata-only operation, and any indexer
--       write that does not yet supply the column also gets the correct value);
--   (2) adds `network` to agents as a denormalized convenience column;
--   (3) adds PARALLEL composite UNIQUE indexes alongside the existing PKs/uniques,
--       so Phase B's indexer can switch its `onConflict` targets to them without a
--       breakage window.
-- The old single-id PK/unique constraints remain fully valid, so the current
-- indexer (onConflict:'id' etc.) and all current read queries keep working
-- unchanged. Reversible: DROP COLUMN / DROP INDEX.
--
-- The DEFAULT is the live MAINNET identity registry. Prod runs a single mainnet
-- indexer, so this is correct there. On disposable testnet/local it mislabels
-- rows as mainnet — acceptable (no permanent history). Phase D drops the DEFAULT
-- once the indexer always writes registry_address explicitly (Phase B).
--
-- Phases: A (this) additive cols+indexes · B indexer writes registry_address +
-- composite onConflict + new RPC overloads · C read-path scoping + leaderboard
-- regroup · D promote composite PK / drop legacy constraints + README · E
-- multi-registry config + networks page. A–C are non-destructive; D is the only
-- destructive step, de-risked by A–C.

-- The live mainnet identity registry address (source of truth:
-- webapp/packages/sdk/src/core/config.ts → MAINNET_CONFIG.contracts.identity).
-- A literal is used because migrations are static SQL; keep it in sync with config
-- if the canonical mainnet registry ever changes.

-- (1) + (2) additive columns -------------------------------------------------

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS registry_address text NOT NULL
    DEFAULT 'CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35';
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS network text NOT NULL DEFAULT 'mainnet';

ALTER TABLE agent_metadata
  ADD COLUMN IF NOT EXISTS registry_address text NOT NULL
    DEFAULT 'CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35';

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS registry_address text NOT NULL
    DEFAULT 'CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35';

ALTER TABLE feedback_responses
  ADD COLUMN IF NOT EXISTS registry_address text NOT NULL
    DEFAULT 'CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35';

ALTER TABLE validations
  ADD COLUMN IF NOT EXISTS registry_address text NOT NULL
    DEFAULT 'CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35';

-- (3) parallel composite UNIQUE indexes --------------------------------------
-- These mirror each table's existing PK/UNIQUE with registry_address prefixed.
-- They are guaranteed unique over current data because registry_address is
-- constant and the trailing columns already carry a unique constraint. Plain
-- (non-CONCURRENT) CREATE INDEX is required: the in-compose `migrate` service
-- wraps each migration file in BEGIN/COMMIT, and CONCURRENTLY cannot run in a
-- transaction. Tables are small, so the brief lock is acceptable.

CREATE UNIQUE INDEX IF NOT EXISTS agents_registry_id_uniq
  ON agents (registry_address, id);

CREATE UNIQUE INDEX IF NOT EXISTS agent_metadata_registry_key_uniq
  ON agent_metadata (registry_address, agent_id, key);

CREATE UNIQUE INDEX IF NOT EXISTS feedback_registry_client_index_uniq
  ON feedback (registry_address, agent_id, client_address, feedback_index);

CREATE UNIQUE INDEX IF NOT EXISTS feedback_responses_registry_full_uniq
  ON feedback_responses (registry_address, agent_id, client_address, feedback_index, response_index);

CREATE UNIQUE INDEX IF NOT EXISTS validations_registry_request_uniq
  ON validations (registry_address, request_hash);

COMMENT ON COLUMN agents.registry_address IS 'Identity-registry contract address this agent was minted under (G1 composite-key discriminator; canonical 8004 id = stellar:{network}:{registry_address}#{id}).';
COMMENT ON COLUMN agents.network IS 'Denormalized network of registry_address (mainnet|testnet); derivable from registry_address, stored for read-side convenience.';
COMMENT ON COLUMN agent_metadata.registry_address IS 'G1: identity registry of the owning agent; part of the future composite key/FK (Phase D).';
COMMENT ON COLUMN feedback.registry_address IS 'G1: identity registry of the rated agent; part of the future composite key/FK (Phase D).';
COMMENT ON COLUMN feedback_responses.registry_address IS 'G1: identity registry of the rated agent; part of the future composite key/FK (Phase D).';
COMMENT ON COLUMN validations.registry_address IS 'G1: identity registry of the validated agent; part of the future composite key/FK (Phase D).';
