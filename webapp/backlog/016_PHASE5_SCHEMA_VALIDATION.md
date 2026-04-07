# 016 - Schema & Validation Hardening

**Status:** DONE
**Owner:** Codex
**Phase:** 5 - Indexer Hardening
**Branch:** `feat/indexer-validation`
**Depends On:** 012

## Context

The indexer parser layer does not validate the format of on-chain data:
- Stellar addresses (G..., 56 char) are not validated
- `numeric(39,18)` does not cover the full i128 range (i128 max ~1.7e38 > numeric(39,18) max ~9.2e21)
- `value_decimals` could be negative or huge with no check
- validation `response` 0-100 check exists only as a DB constraint

**From the 8004 protocol perspective:** Feedback `value` is i128 - the Soroban contract accepts negative values (e.g. -50 score). The DB must hold these. If the agent address is invalid, the trust data becomes meaningless.

### Critic findings (BLOCK resolutions)

- **CRITIC-section 3 (StrKey Deno compatibility issue):** `@stellar/stellar-sdk` cannot be imported in Deno (`denoland/deno#26132`). `StrKey.isValidEd25519PublicKey` is unusable. **Pure JS alternative required.**
- **CRITIC-section 6 (FORCE RLS unnecessary):** `service_role` has the `BYPASSRLS` attribute. `FORCE ROW LEVEL SECURITY` only affects the table owner, not `BYPASSRLS` roles. **Task removed.**
- **CRITIC-section 2 (POWER claim wrong):** In PostgreSQL `POWER(numeric, integer)` already returns `numeric`, NOT float. But `10::numeric ^ x` is more explicit and readable. **Claim corrected, change kept.**

## File Scope

- `packages/indexer/src/helpers.ts` (new: `isValidStellarAddress` - pure JS)
- `packages/indexer/src/parsers/identity.ts`
- `packages/indexer/src/parsers/reputation.ts`
- `packages/indexer/src/parsers/validation.ts`
- `supabase/migrations/` (numeric precision, CHECK constraints, POWER explicit numeric, statement_timeout, search_agents bound, realtime column filter)

## Requirements

- [ ] Stellar address format validation - **pure JS** (StrKey does not work in Deno)
- [ ] `numeric(39,18)` -> `numeric(78,0)` - full i128 range support
- [ ] `value_decimals` bounds check: 0 <= x <= 18
- [ ] `response` 0-100 range check at parser level
- [ ] `toHex()` - return empty string instead of TypeError on null/undefined input
- [ ] Leaderboard view `POWER(10, x)` -> `(10::numeric ^ x)` - more explicit numeric semantics (note: POWER already returns numeric, this is for readability)
- [ ] CHECK constraints: `validations.response` range, `feedback.feedback_index` positive, `agents.id` positive
- [ ] `search_agents()` limit bound (max 100) and `statement_timeout = '5s'`
- [ ] `refresh_leaderboard()` function gets `statement_timeout = '30s'`
- [ ] Realtime publication column filter (only the columns that are needed)
- [ ] ~~`FORCE ROW LEVEL SECURITY`~~ **REMOVED** - CRITIC-section 6: service_role BYPASSRLS, FORCE has no effect

## Implementation Plan

### Task 1: Stellar address validation - Pure JS (CRITIC-section 3 FIX)

`@stellar/stellar-sdk` cannot be imported in Deno. Pure JS implementation:

```typescript
// helpers.ts - pure JS Stellar address validation
// G-address: version byte (6 << 3 = 48) + 32 bytes ed25519 key + 2 bytes CRC16-XMODEM
// Base32-encoded -> 56 characters, starts with 'G'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Uint8Array {
  const output = new Uint8Array(Math.floor(input.length * 5 / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (const char of input) {
    const i = BASE32_ALPHABET.indexOf(char);
    if (i === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }

  return output.slice(0, index);
}

function crc16xmodem(data: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

export function isValidStellarAddress(address: string): boolean {
  if (typeof address !== 'string' || address.length !== 56) return false;
  if (address[0] !== 'G') return false;  // Ed25519 public key version byte

  try {
    const decoded = base32Decode(address);
    if (decoded.length !== 35) return false;  // 1 version + 32 key + 2 checksum

    // Version byte check: G = 6 << 3 = 48
    if (decoded[0] !== 6 << 3) return false;

    // CRC16-XMODEM checksum over version + payload (33 bytes)
    const payload = decoded.slice(0, 33);
    const checksum = (decoded[33] << 8) | decoded[34];
    return crc16xmodem(payload) === checksum;
  } catch {
    return false;
  }
}
```

Usage in parsers:
```typescript
const owner = String(scValToNative(event.topic[2]));
if (!isValidStellarAddress(owner)) {
  log({ level: 'warn', msg: 'Invalid owner address', contract: 'identity', address: owner });
  return null;
}
```

**Test vectors:**
```typescript
// Valid: Stellar Friendbot address
isValidStellarAddress('GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR') // true
// Invalid: wrong length
isValidStellarAddress('GAIH3ULL') // false
// Invalid: bad checksum
isValidStellarAddress('GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNAA') // false
// Invalid: not G-address
isValidStellarAddress('SAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR') // false
```

### Task 2: Numeric precision migration

```sql
-- supabase/migrations/XXX_feedback_value_precision.sql
-- i128: -170141183460469231731687303715884105728 to 170141183460469231731687303715884105727
-- numeric(78,0) covers full range, value_decimals applied at query time
ALTER TABLE feedback
  ALTER COLUMN value TYPE numeric(78,0)
  USING value::numeric(78,0);
```

### Task 3: Parser-level bounds checking

```typescript
// reputation.ts - NewFeedback:
const valueDecimals = Number(data.value_decimals ?? 0);
if (valueDecimals < 0 || valueDecimals > 18) {
  log({ level: 'warn', msg: 'Invalid value_decimals', value: valueDecimals });
  return null;
}

// validation.ts - ValidationResponded:
const response = Number(data.response);
if (response < 0 || response > 100 || !Number.isFinite(response)) {
  log({ level: 'warn', msg: 'Invalid response score', value: response });
  return null;
}
```

### Task 4: `toHex` defensive handling

```typescript
export function toHex(buf: unknown): string {
  if (buf == null) return '';  // null/undefined -> empty string (optional fields)

  if (buf instanceof Uint8Array) {
    return Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  if (typeof buf === 'string') {
    if (!/^[0-9a-fA-F]*$/.test(buf)) return '';
    return buf.toLowerCase();
  }

  return '';
}
```

### Task 5: Leaderboard view - explicit numeric exponent (CRITIC-section 2 REVISED)

**Note:** `POWER(numeric, integer)` already returns `numeric` - no float precision loss. But `10::numeric ^ x` is more explicit and readable.

```sql
-- Current (functionally correct):
AVG(value / POWER(10, value_decimals)) FILTER (WHERE NOT is_revoked) AS avg_score

-- More explicit (readability):
AVG(value / (10::numeric ^ value_decimals)) FILTER (WHERE NOT is_revoked) AS avg_score
```

Leaderboard materialized view will be recreated via DROP + CREATE.

### Task 6: CHECK constraints

```sql
-- supabase/migrations/XXX_check_constraints.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'validations_response_range') THEN
    ALTER TABLE validations
      ADD CONSTRAINT validations_response_range
      CHECK (response IS NULL OR (response >= 0 AND response <= 100));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_value_decimals_range') THEN
    ALTER TABLE feedback
      ADD CONSTRAINT feedback_value_decimals_range
      CHECK (value_decimals >= 0 AND value_decimals <= 18);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_index_positive') THEN
    ALTER TABLE feedback
      ADD CONSTRAINT feedback_index_positive
      CHECK (feedback_index::bigint >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_id_positive') THEN
    ALTER TABLE agents
      ADD CONSTRAINT agents_id_positive
      CHECK (id >= 0);
  END IF;
END $$;
```

### Task 7: search_agents() limit bound + statement_timeout

```sql
CREATE OR REPLACE FUNCTION search_agents(
  search_query text,
  result_limit integer DEFAULT 20,
  result_offset integer DEFAULT 0
)
RETURNS SETOF agents
LANGUAGE plpgsql
STABLE
SET search_path = ''
SET statement_timeout = '5s'
AS $$
BEGIN
  result_limit := LEAST(GREATEST(result_limit, 1), 100);
  result_offset := GREATEST(result_offset, 0);

  IF search_query = '' OR search_query IS NULL THEN
    RETURN QUERY
      SELECT *
      FROM public.agents
      ORDER BY created_at DESC
      LIMIT result_limit
      OFFSET result_offset;
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.agents
      WHERE search_vector @@ plainto_tsquery('english', search_query)
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', search_query)) DESC
      LIMIT result_limit
      OFFSET result_offset;
  END IF;
END;
$$;
```

### Task 8: refresh_leaderboard() statement_timeout

```sql
ALTER FUNCTION refresh_leaderboard SET statement_timeout = '30s';
```

### Task 9: Realtime publication column filter

```sql
-- supabase/migrations/XXX_realtime_column_filter.sql
-- PK columns must be included (replica identity)
ALTER PUBLICATION supabase_realtime DROP TABLE agents;
ALTER PUBLICATION supabase_realtime DROP TABLE feedback;
ALTER PUBLICATION supabase_realtime DROP TABLE validations;

ALTER PUBLICATION supabase_realtime ADD TABLE agents (id, owner, agent_uri_data, wallet, created_at, updated_at);
ALTER PUBLICATION supabase_realtime ADD TABLE feedback (id, agent_id, client_address, value, value_decimals, tag1, is_revoked, created_at);
ALTER PUBLICATION supabase_realtime ADD TABLE validations (request_hash, agent_id, validator_address, response, has_response, created_at, responded_at);
```

**Note (CRITIC-section 5):** PG docs warning: "Do not rely on this feature for security: a malicious subscriber is able to obtain data from columns that are not specifically published." This project uses it for internal security only, which is acceptable.

## Verification

- [ ] Event with invalid Stellar address -> logged and skipped (null return)
- [ ] Valid Stellar address (G..., 56 char, checksum correct) is accepted
- [ ] `isValidStellarAddress` pure JS - does NOT import `@stellar/stellar-sdk`
- [ ] `i128` max value can be written as a feedback value (no overflow)
- [ ] `value_decimals = 19` -> event rejected
- [ ] `response = 150` -> event rejected
- [ ] Migration does not corrupt existing data
- [ ] `pnpm --filter @8004scan/indexer test` passes
- [ ] Leaderboard view works correctly with numeric(78,0)
- [ ] `search_agents('', 999999)` -> returns at most 100 results
- [ ] `refresh_leaderboard()` times out if it runs longer than 30s
- [ ] Realtime subscription does not expose internal fields like `tx_hash`, `feedback_hash`
- [ ] ~~FORCE RLS~~ **REMOVED** - CRITIC-section 6
