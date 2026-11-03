-- D1 (SQLite) schema for stellar8004. It replaces the Supabase Postgres schema
-- (supabase/migrations 001-049) and keeps every value the site and API show.
--
-- Type conventions (readers decode, writers encode):
--   booleans       INTEGER 0/1 with a CHECK; readers map them to true/false.
--   timestamps     TEXT 'YYYY-MM-DDTHH:MM:SS[.ffffff]+00:00', the shape PostgREST emitted.
--                  One offset and one layout keep text order equal to time order.
--   JSON           TEXT holding valid JSON (agent_uri_data, services, supported_trust).
--   feedback.value TEXT holding an exact integer. The contract allows |value| <= 1e38,
--                  which fits neither INTEGER nor REAL.
-- What replaces the Postgres-only pieces:
--   leaderboard materialized view + refresh functions -> the leaderboard_scores VIEW below
--   tsvector search                                   -> agents_fts (FTS5) + triggers
--   api rate-limit table + pg_cron cleanup            -> Workers rate limiting binding
--   PL/pgSQL writer functions                         -> single statements in the indexer
--   RLS, grants, realtime, pg_cron                    -> nothing: only Workers holding the
--                                                        binding can reach the data

CREATE TABLE agents (
  id                      INTEGER PRIMARY KEY CHECK (id >= 0),
  owner                   TEXT NOT NULL CHECK (length(owner) <= 256),
  agent_uri               TEXT,
  agent_uri_data          TEXT CHECK (agent_uri_data IS NULL OR json_valid(agent_uri_data)),
  wallet                  TEXT CHECK (wallet IS NULL OR length(wallet) <= 256),
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')),
  created_ledger          INTEGER,
  tx_hash                 TEXT,
  uri_resolve_attempts    INTEGER NOT NULL DEFAULT 0,
  resolve_uri_pending     INTEGER NOT NULL DEFAULT 0 CHECK (resolve_uri_pending IN (0, 1)),
  last_resolve_attempt_at TEXT,
  supported_trust         TEXT NOT NULL DEFAULT '[]' CHECK (json_type(supported_trust) = 'array'),
  services                TEXT NOT NULL DEFAULT '[]' CHECK (json_type(services) = 'array'),
  x402_enabled            INTEGER NOT NULL DEFAULT 0 CHECK (x402_enabled IN (0, 1)),
  mpp_enabled             INTEGER NOT NULL DEFAULT 0 CHECK (mpp_enabled IN (0, 1)),
  uri_updated_ledger      INTEGER,
  transferred_ledger      INTEGER
);

CREATE TABLE agent_metadata (
  agent_id INTEGER NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  value    TEXT,
  PRIMARY KEY (agent_id, key)
);

CREATE TABLE feedback (
  id             INTEGER PRIMARY KEY,
  agent_id       INTEGER NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  client_address TEXT NOT NULL CHECK (length(client_address) <= 256),
  feedback_index INTEGER NOT NULL CHECK (feedback_index >= 1),
  value          TEXT NOT NULL CHECK (value GLOB '[0-9]*' OR value GLOB '-[0-9]*'),
  value_decimals INTEGER NOT NULL DEFAULT 0 CHECK (value_decimals BETWEEN 0 AND 18),
  tag1           TEXT,
  tag2           TEXT,
  endpoint       TEXT,
  feedback_uri   TEXT,
  feedback_hash  TEXT,
  is_revoked     INTEGER NOT NULL DEFAULT 0 CHECK (is_revoked IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')),
  created_ledger INTEGER,
  tx_hash        TEXT,
  revoked_ledger INTEGER,
  UNIQUE (agent_id, client_address, feedback_index),
  -- GLOB above only checks the first character; this rejects anything after it.
  CHECK (ltrim(value, '-') NOT GLOB '*[^0-9]*' AND ltrim(value, '-') <> '')
);

CREATE TABLE feedback_responses (
  id             INTEGER PRIMARY KEY,
  agent_id       INTEGER NOT NULL,
  client_address TEXT NOT NULL CHECK (length(client_address) <= 256),
  feedback_index INTEGER NOT NULL,
  response_index INTEGER NOT NULL,
  responder      TEXT NOT NULL CHECK (length(responder) <= 256),
  response_uri   TEXT,
  response_hash  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')),
  tx_hash        TEXT,
  event_id       TEXT UNIQUE,
  UNIQUE (agent_id, client_address, feedback_index, response_index),
  FOREIGN KEY (agent_id, client_address, feedback_index)
    REFERENCES feedback (agent_id, client_address, feedback_index) ON DELETE CASCADE
);

CREATE TABLE validations (
  request_hash      TEXT PRIMARY KEY NOT NULL,
  agent_id          INTEGER NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  validator_address TEXT NOT NULL CHECK (length(validator_address) <= 256),
  request_uri       TEXT,
  response          INTEGER CHECK (response IS NULL OR response BETWEEN 0 AND 100),
  response_uri      TEXT,
  response_hash     TEXT,
  tag               TEXT CHECK (tag IS NULL OR length(tag) <= 64),
  has_response      INTEGER NOT NULL DEFAULT 0 CHECK (has_response IN (0, 1)),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')),
  responded_at      TEXT,
  request_tx_hash   TEXT,
  response_tx_hash  TEXT,
  response_ledger   INTEGER
);

-- One row per contract. No seed rows: the data copy writes them, and the indexer must
-- treat a missing row as fatal rather than cold-start at the edge of RPC retention.
CREATE TABLE indexer_state (
  id                   TEXT PRIMARY KEY NOT NULL,
  last_ledger          INTEGER NOT NULL DEFAULT 0,
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')),
  expected_next_ledger INTEGER,
  defer_attempts       INTEGER NOT NULL DEFAULT 0,
  last_advanced_at     TEXT
);

CREATE TABLE indexer_locks (
  lock_name   TEXT PRIMARY KEY NOT NULL,
  acquired_at TEXT NOT NULL,
  owner       TEXT
);
-- Copy fence: it never goes stale, so no indexer run can start until the cutover step
-- deletes it, and the data copy refuses to run once it is gone.
INSERT INTO indexer_locks VALUES ('indexer', '9999-12-31T00:00:00+00:00', 'copy-fence');

CREATE TABLE indexer_dead_letter (
  id         INTEGER PRIMARY KEY,
  contract   TEXT NOT NULL,
  reason     TEXT NOT NULL,
  event_id   TEXT,
  ledger     INTEGER,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now'))
);

-- Full-text search over agent names and descriptions.
CREATE VIRTUAL TABLE agents_fts USING fts5 (
  name, description, tokenize = 'porter unicode61 remove_diacritics 0'
);
CREATE TRIGGER agents_fts_insert AFTER INSERT ON agents BEGIN
  INSERT INTO agents_fts (rowid, name, description)
  VALUES (NEW.id, CAST(NEW.agent_uri_data ->> '$.name' AS TEXT), CAST(NEW.agent_uri_data ->> '$.description' AS TEXT));
END;
CREATE TRIGGER agents_fts_update AFTER UPDATE OF agent_uri_data ON agents BEGIN
  DELETE FROM agents_fts WHERE rowid = OLD.id;
  INSERT INTO agents_fts (rowid, name, description)
  VALUES (NEW.id, CAST(NEW.agent_uri_data ->> '$.name' AS TEXT), CAST(NEW.agent_uri_data ->> '$.description' AS TEXT));
END;
CREATE TRIGGER agents_fts_delete AFTER DELETE ON agents BEGIN
  DELETE FROM agents_fts WHERE rowid = OLD.id;
END;

-- A transfer clears the agent's metadata. Only the transfer writer sets transferred_ledger,
-- through a ledger-guarded UPDATE, so this fires only when that UPDATE matched a row.
CREATE TRIGGER agents_transfer_clears_metadata AFTER UPDATE OF transferred_ledger ON agents BEGIN
  DELETE FROM agent_metadata WHERE agent_id = NEW.id;
END;

-- Leaderboard. Same numbers as the live Postgres view: total_score = avg_score = mean of
-- value / 10^value_decimals over non-revoked feedback not given by the agent's current
-- owner, rounded half away from zero to 2 decimals.
--
-- Exact path: when an agent's values have at most 6 decimals, |value| < 10^4 and there are
-- at most 10^7 of them, the sum is computed in 64-bit integers from the exact decimal
-- text, then rounded once. Outside that domain the view falls back to REAL and reports
-- score_exact = 0. ponytail: REAL fallback for exotic values; aggregate with BigInt in the
-- Worker if such rows ever appear.
CREATE VIEW leaderboard_scores AS
WITH fb AS (
  SELECT f.agent_id, f.client_address, f.value AS v, f.value_decimals AS d
  FROM feedback f JOIN agents a ON a.id = f.agent_id
  WHERE f.is_revoked = 0 AND f.client_address <> a.owner
), g AS (
  SELECT agent_id,
         COUNT(*)                       AS n,
         COUNT(DISTINCT client_address) AS clients,
         max(MAX(d), 2)                 AS k,          -- common scale, at least cents
         MAX(length(ltrim(v, '-')) - d) AS int_digits  -- |value| < 10^int_digits
  FROM fb GROUP BY agent_id
), x AS (
  SELECT g.agent_id, g.n, g.clients,
         (g.k <= 6 AND g.int_digits <= 4 AND g.n <= 10000000) AS exact,
         -- exact sum of value * 10^k, built by appending zeros to the decimal text
         SUM(CASE WHEN g.k <= 6 AND g.int_digits <= 4 AND g.n <= 10000000
                  THEN CAST(fb.v || substr('000000', 1, g.k - fb.d) AS INTEGER) END) AS s,
         g.n * CAST('1' || substr('0000', 1, g.k - 2) AS INTEGER) AS m,  -- n * 10^(k-2)
         AVG(CAST(fb.v AS REAL) / CAST('1' || substr('000000000000000000', 1, fb.d) AS REAL)) AS avg_real
  FROM fb JOIN g USING (agent_id)
  GROUP BY g.agent_id
), sc AS (
  SELECT agent_id, n, clients, exact,
         CASE WHEN exact
              THEN (CASE WHEN s < 0 THEN -1 ELSE 1 END) * ((2 * abs(s) + m) / (2 * m)) / 100.0
              ELSE round(avg_real, 2) END AS score
  FROM x
)
SELECT a.id                              AS agent_id,
       CAST(a.agent_uri_data ->> '$.name' AS TEXT)  AS agent_name,  -- ->> returns numbers as numbers; Postgres gave text
       CAST(a.agent_uri_data ->> '$.image' AS TEXT) AS agent_image,
       a.owner,
       a.supported_trust,
       json_array_length(a.services) > 0 AS has_services,
       COALESCE(sc.n, 0)                 AS feedback_count,
       COALESCE(sc.score, 0)             AS avg_score,
       COALESCE(sc.clients, 0)           AS unique_clients,
       COALESCE(sc.score, 0)             AS total_score,
       COALESCE(sc.exact, 1)             AS score_exact
FROM agents a LEFT JOIN sc ON sc.agent_id = a.id;
