# 016 — Schema & Validation Hardening

**Status:** DONE
**Owner:** Codex
**Phase:** 5 — Indexer Hardening
**Branch:** `feat/indexer-validation`
**Depends On:** 012

## Context

Indexer'ın parser katmanı on-chain verinin formatını doğrulamıyor:
- Stellar adresleri (G..., 56 char) validate edilmiyor
- `numeric(39,18)` i128 tam aralığını karşılamıyor (i128 max ~1.7e38 > numeric(39,18) max ~9.2e21)
- `value_decimals` negatif/büyük olabilir, kontrol yok
- validation `response` 0-100 kontrolü sadece DB constraint'inde

**8004 protokolü açısından:** Feedback `value` i128 tipi — Soroban kontratı negatif değer kabul eder (ör. -50 skor). DB bunu tutabilmeli. Agent adresi geçersizse trust verisi anlamsızlaşır.

### Critic Bulguları (BLOCK çözümleri)

- **CRITIC-§3 (StrKey Deno uyumluluk sorunu):** `@stellar/stellar-sdk` Deno'da import edilemiyor (`denoland/deno#26132`). `StrKey.isValidEd25519PublicKey` kullanılamaz. **Pure JS alternative yazılmalı.**
- **CRITIC-§6 (FORCE RLS gereksiz):** `service_role` `BYPASSRLS` attribute'üne sahip. `FORCE ROW LEVEL SECURITY` sadece table owner'ı etkiler, `BYPASSRLS` role'leri etkilemez. **Task kaldırıldı.**
- **CRITIC-§2 (POWER iddiası yanlış):** PostgreSQL'de `POWER(numeric, integer)` zaten `numeric` döner, float DEĞİL. Ama `10::numeric ^ x` daha explicit ve okunabilir. **İddia düzeltildi, değişiklik korundu.**

## File Scope

- `packages/indexer/src/helpers.ts` (yeni: `isValidStellarAddress` — pure JS)
- `packages/indexer/src/parsers/identity.ts`
- `packages/indexer/src/parsers/reputation.ts`
- `packages/indexer/src/parsers/validation.ts`
- `supabase/migrations/` (numeric precision, CHECK constraints, POWER explicit numeric, statement_timeout, search_agents bound, realtime column filter)

## Requirements

- [ ] Stellar adres format doğrulaması — **pure JS** (StrKey Deno'da çalışmaz)
- [ ] `numeric(39,18)` → `numeric(78,0)` — i128 tam aralık desteği
- [ ] `value_decimals` bounds check: 0 ≤ x ≤ 18
- [ ] `response` 0-100 range check parser seviyesinde
- [ ] `toHex()` — null/undefined input'ta TypeError yerine empty string
- [ ] Leaderboard view `POWER(10, x)` → `(10::numeric ^ x)` — daha explicit numeric semantik (not: POWER zaten numeric döner, bu okunabilirlik için)
- [ ] CHECK constraint'ler: `validations.response` range, `feedback.feedback_index` positive, `agents.id` positive
- [ ] `search_agents()` limit bound (max 100) ve `statement_timeout = '5s'`
- [ ] `refresh_leaderboard()` fonksiyonuna `statement_timeout = '30s'`
- [ ] Realtime publication kolon filtresi (sadece gerekli kolonlar)
- [ ] ~~`FORCE ROW LEVEL SECURITY`~~ **KALDIRILDI** — CRITIC-§6: service_role BYPASSRLS, FORCE etkisiz

## Implementation Plan

### Task 1: Stellar adres validasyonu — Pure JS (CRITIC-§3 FIX)

`@stellar/stellar-sdk` Deno'da import edilemiyor. Pure JS implementasyon:

```typescript
// helpers.ts — pure JS Stellar address validation
// G-address: version byte (6 << 3 = 48) + 32 bytes ed25519 key + 2 bytes CRC16-XMODEM
// Base32-encoded → 56 characters, starts with 'G'

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

Parser'larda kullanım:
```typescript
const owner = String(scValToNative(event.topic[2]));
if (!isValidStellarAddress(owner)) {
  log({ level: 'warn', msg: 'Invalid owner address', contract: 'identity', address: owner });
  return null;
}
```

**Test vektörleri:**
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
// reputation.ts — NewFeedback:
const valueDecimals = Number(data.value_decimals ?? 0);
if (valueDecimals < 0 || valueDecimals > 18) {
  log({ level: 'warn', msg: 'Invalid value_decimals', value: valueDecimals });
  return null;
}

// validation.ts — ValidationResponded:
const response = Number(data.response);
if (response < 0 || response > 100 || !Number.isFinite(response)) {
  log({ level: 'warn', msg: 'Invalid response score', value: response });
  return null;
}
```

### Task 4: `toHex` defensive handling

```typescript
export function toHex(buf: unknown): string {
  if (buf == null) return '';  // null/undefined → empty string (optional fields)

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

### Task 5: Leaderboard view — explicit numeric exponent (CRITIC-§2 REVISED)

**Not:** `POWER(numeric, integer)` zaten `numeric` döner — float precision kaybı yok. Ama `10::numeric ^ x` daha explicit ve okunabilir.

```sql
-- Mevcut (fonksiyonel olarak doğru):
AVG(value / POWER(10, value_decimals)) FILTER (WHERE NOT is_revoked) AS avg_score

-- Daha explicit (okunabilirlik):
AVG(value / (10::numeric ^ value_decimals)) FILTER (WHERE NOT is_revoked) AS avg_score
```

Leaderboard materialized view DROP + CREATE ile yeniden oluşturulacak.

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

### Task 9: Realtime publication kolon filtresi

```sql
-- supabase/migrations/XXX_realtime_column_filter.sql
-- PK kolonları dahil edilmeli (replica identity)
ALTER PUBLICATION supabase_realtime DROP TABLE agents;
ALTER PUBLICATION supabase_realtime DROP TABLE feedback;
ALTER PUBLICATION supabase_realtime DROP TABLE validations;

ALTER PUBLICATION supabase_realtime ADD TABLE agents (id, owner, agent_uri_data, wallet, created_at, updated_at);
ALTER PUBLICATION supabase_realtime ADD TABLE feedback (id, agent_id, client_address, value, value_decimals, tag1, is_revoked, created_at);
ALTER PUBLICATION supabase_realtime ADD TABLE validations (request_hash, agent_id, validator_address, response, has_response, created_at, responded_at);
```

**Not (CRITIC-§5):** PG docs uyarısı: "Do not rely on this feature for security: a malicious subscriber is able to obtain data from columns that are not specifically published." Bu projede internal güvenlik için kullanılıyor, kabul edilebilir.

## Verification

- [ ] Geçersiz Stellar adresi olan event → loglanır ve atlanır (null return)
- [ ] Valid Stellar adresi (G..., 56 char, checksum doğru) kabul edilir
- [ ] `isValidStellarAddress` pure JS — `@stellar/stellar-sdk` import ETMEZ
- [ ] `i128` max değeri feedback value olarak yazılabilir (overflow yok)
- [ ] `value_decimals = 19` → event reject edilir
- [ ] `response = 150` → event reject edilir
- [ ] Migration mevcut veriyi bozmaz
- [ ] `pnpm --filter @8004scan/indexer test` başarılı
- [ ] Leaderboard view numeric(78,0) ile doğru çalışır
- [ ] `search_agents('', 999999)` → max 100 sonuç döner
- [ ] `refresh_leaderboard()` 30s'den uzun sürerse timeout alır
- [ ] Realtime subscription'da `tx_hash`, `feedback_hash` gibi internal alanlar görünmez
- [ ] ~~FORCE RLS~~ **KALDIRILDI** — CRITIC-§6
