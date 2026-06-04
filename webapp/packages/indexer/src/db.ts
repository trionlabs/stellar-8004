import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { requireEnv } from './env.js';
import { log } from './logger.js';
import type { IdentityEvent } from './parsers/identity.js';
import type { ReputationEvent } from './parsers/reputation.js';
import type { ValidationEvent } from './parsers/validation.js';

type SupabaseResult = {
  error: { message: string; code?: string } | null;
};

const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

// PostgreSQL SQLSTATEs the indexer treats as transient: the write should be
// deferred and retried next run rather than dropped as corrupt data.
//   23503 foreign_key_violation       - referenced parent row not indexed yet
//   55P03 lock_not_available          - insert_feedback_response lock_timeout fired
//   40001 serialization_failure       - concurrent passes serialized
//   40P01 deadlock_detected           - concurrent passes deadlocked
//   08000/08003/08006 connection_*    - transient DB connection loss
//   53300 too_many_connections        - pool exhaustion under load
//   53400 configuration_limit_exceeded
//   57014 query_canceled              - statement_timeout fired mid-write
//   57P01 admin_shutdown / 57P03 cannot_connect_now - DB restart/failover
// Network-level failures (no SQLSTATE: postgrest-js reports code='' for a
// client-side fetch error, or a 5xx with a non-JSON body has no code) are NOT
// listed here but are still deferred — the indexer loop treats an unclassified
// write failure as a transient defer rather than a silent drop.
const RETRYABLE_PG_CODES = new Set([
  '23503',
  '55P03',
  '40001',
  '40P01',
  '08000',
  '08003',
  '08006',
  '53300',
  '53400',
  '57014',
  '57P01',
  '57P03',
]);

/**
 * Thrown by writers when a Supabase operation fails. `retryable` marks
 * failures the indexer should defer (re-process next run) instead of counting
 * as a permanent per-event error.
 */
export class IndexerWriteError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'IndexerWriteError';
    this.retryable = retryable;
  }
}

export function isRetryableWriteError(error: unknown): boolean {
  return error instanceof IndexerWriteError && error.retryable;
}

function assertNoError(result: SupabaseResult, context: string): void {
  if (result.error) {
    const retryable = result.error.code != null && RETRYABLE_PG_CODES.has(result.error.code);
    throw new IndexerWriteError(`${context}: ${result.error.message}`, retryable);
  }
}

function toDbBigint(value: bigint): string {
  return value.toString();
}

function logMalformedEvent(
  contract: 'identity' | 'reputation' | 'validation',
  eventType: string,
  payload: unknown,
): void {
  log({
    level: 'error',
    msg: 'Malformed event payload',
    contract,
    event: eventType,
    payload,
  });
}

export function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
}

export async function getLastLedger(
  db: SupabaseClient,
  contractName: string,
): Promise<number> {
  const result = await db
    .from('indexer_state')
    .select('last_ledger')
    .eq('id', contractName)
    .maybeSingle();

  assertNoError(result, `[indexer_state] failed to read checkpoint for ${contractName}`);

  return Number(result.data?.last_ledger ?? 0);
}

export interface CheckpointState {
  /** Last fully-processed ledger; 0 means cold start. */
  lastLedger: number;
  /** Ledger the previous run expected to resume from (gap detection); null if unset. */
  expectedNext: number | null;
  /** Consecutive runs that deferred this contract on a retryable write failure. */
  deferAttempts: number;
}

/**
 * Reads all checkpoint columns for a contract in a single round-trip.
 * `defer_attempts` drives the escape hatch that eventually skips a
 * permanently-unresolvable event so the stream can advance.
 */
export async function getCheckpointState(
  db: SupabaseClient,
  contractName: string,
): Promise<CheckpointState> {
  const result = await db
    .from('indexer_state')
    .select('last_ledger, expected_next_ledger, defer_attempts')
    .eq('id', contractName)
    .maybeSingle();

  assertNoError(result, `[indexer_state] failed to read checkpoint for ${contractName}`);

  const row = result.data;
  return {
    lastLedger: Number(row?.last_ledger ?? 0),
    expectedNext: row?.expected_next_ledger != null ? Number(row.expected_next_ledger) : null,
    deferAttempts: Number(row?.defer_attempts ?? 0),
  };
}

export async function updateCheckpoint(
  db: SupabaseClient,
  contractName: string,
  ledger: number,
  expectedNextLedger?: number,
  deferAttempts = 0,
  advanced = false,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    id: contractName,
    last_ledger: ledger,
    expected_next_ledger: expectedNextLedger ?? null,
    defer_attempts: deferAttempts,
    updated_at: now,
  };
  // Honest liveness: only stamp last_advanced_at when the checkpoint actually
  // moved forward. Omitting the column on a no-progress run preserves its prior
  // value through the merge-duplicates upsert, so the health staleness check
  // (which reads last_advanced_at) reflects real forward progress rather than
  // mere run activity. See migration 044.
  if (advanced) patch.last_advanced_at = now;

  const result = await db.from('indexer_state').upsert(patch);

  assertNoError(result, `[indexer_state] failed to update checkpoint for ${contractName}`);
}

/**
 * Durably record an on-chain event (or ledger range) the indexer is about to
 * SKIP past — the MAX_DEFER_ATTEMPTS escape hatch and the RPC retention clamp
 * both advance the checkpoint over events they could not write. Best-effort: a
 * dead-letter failure is logged but never thrown, so it can never re-wedge the
 * loop it exists to make observable. See migration 045.
 */
export async function recordDeadLetter(
  db: SupabaseClient,
  entry: {
    contract: string;
    reason: 'skip-retryable' | 'skip-nonretryable' | 'retention-clamp';
    eventId?: string | null;
    ledger?: number | null;
    detail?: string | null;
  },
): Promise<void> {
  try {
    const result = await db.from('indexer_dead_letter').insert({
      contract: entry.contract,
      reason: entry.reason,
      event_id: entry.eventId ?? null,
      ledger: entry.ledger ?? null,
      detail: entry.detail ?? null,
    });
    if (result.error) {
      log({
        level: 'warn',
        msg: 'Failed to record dead-letter entry',
        contract: entry.contract,
        reason: entry.reason,
        error: result.error.message,
      });
    }
  } catch (error) {
    log({
      level: 'warn',
      msg: 'Failed to record dead-letter entry',
      contract: entry.contract,
      reason: entry.reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function writeIdentityEvent(
  db: SupabaseClient,
  event: IdentityEvent,
): Promise<void> {
  switch (event.type) {
    case 'Registered': {
      if (event.agentId == null || !event.owner) {
        logMalformedEvent('identity', 'Registered', event);
        return;
      }

      const shouldResolveUri =
        typeof event.agentUri === 'string' && event.agentUri.length > 0;
      // Registration is a one-time on-chain event per agent id, so re-seeing a
      // `Registered` event only happens on at-least-once replay (a deferred or
      // re-scanned batch). Use ignoreDuplicates so a replay does NOT clobber
      // async URI-resolution state (agent_uri_data, resolve_uri_pending, ...)
      // that the resolver populated after the first insert.
      const result = await db.from('agents').upsert(
        {
          id: event.agentId,
          owner: event.owner,
          agent_uri: event.agentUri,
          agent_uri_data: null,
          uri_resolve_attempts: 0,
          resolve_uri_pending: shouldResolveUri,
          created_at: event.ledgerClosedAt,
          created_ledger: event.ledger,
          tx_hash: event.txHash,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );

      assertNoError(result, `[identity] failed to upsert Registered agent ${event.agentId}`);
      break;
    }

    case 'UriUpdated': {
      // This UPDATE is intentionally destructive: a URI change must invalidate
      // previously-resolved data. The ledger guard (uri_updated_ledger, migration
      // 046) makes it monotonic and reorder-safe — a stale/replayed older
      // UriUpdated can no longer wipe data resolved from a newer URI. We do NOT
      // rely on RPC ledger-ordering for correctness.
      if (event.agentId == null || !event.newUri) {
        logMalformedEvent('identity', 'UriUpdated', event);
        return;
      }

      const result = await db
        .from('agents')
        .update({
          agent_uri: event.newUri,
          agent_uri_data: null,
          supported_trust: [],
          services: [],
          uri_resolve_attempts: 0,
          resolve_uri_pending: true,
          uri_updated_ledger: event.ledger,
        })
        .eq('id', event.agentId)
        .or(`uri_updated_ledger.is.null,uri_updated_ledger.lte.${event.ledger}`);

      assertNoError(result, `[identity] failed to update URI for agent ${event.agentId}`);
      break;
    }

    case 'MetadataSet': {
      if (event.agentId == null || !event.key) {
        logMalformedEvent('identity', 'MetadataSet', event);
        return;
      }

      const value =
        typeof event.value === 'string'
          ? event.value
          : utf8Decoder.decode(event.value);

      const result = await db.from('agent_metadata').upsert(
        {
          agent_id: event.agentId,
          key: event.key,
          value,
        },
        { onConflict: 'agent_id,key' },
      );

      assertNoError(
        result,
        `[identity] failed to upsert metadata ${event.key} for agent ${event.agentId}`,
      );
      break;
    }

    case 'AgentWalletSet': {
      // Synthetic shape derived from a `metadata_set` event whose indexed
      // key is "agentWallet". The canonical erc-8004 reference uses
      // MetadataSet for ALL wallet writes (no dedicated wallet event); the
      // parser promotes the relevant rows to this typed shape so the
      // wallet column gets a clean update path. The raw on-chain event is
      // still MetadataSet for cross-chain subscribers.
      if (event.agentId == null || !event.newWallet) {
        logMalformedEvent('identity', 'AgentWalletSet', event);
        return;
      }

      const result = await db
        .from('agents')
        .update({ wallet: event.newWallet })
        .eq('id', event.agentId);

      assertNoError(result, `[identity] failed to set wallet for agent ${event.agentId}`);
      break;
    }

    case 'AgentWalletUnset': {
      // Same provenance as AgentWalletSet: a `metadata_set` event with
      // key="agentWallet" and an empty bytes value. Spec parity with the
      // canonical reference's `_update` override that emits a MetadataSet
      // with empty bytes on transfer (and `unsetAgentWallet` does the
      // same).
      if (event.agentId == null) {
        logMalformedEvent('identity', 'AgentWalletUnset', event);
        return;
      }

      const result = await db
        .from('agents')
        .update({ wallet: null })
        .eq('id', event.agentId);

      assertNoError(result, `[identity] failed to clear wallet for agent ${event.agentId}`);
      break;
    }

    case 'AgentTransferred': {
      // NFT ownership changed hands. Track the new owner; without this the DB
      // `owner` is frozen at the original minter forever, which corrupts the
      // API owner field, the by-owner account listings, and the leaderboard
      // self-feedback filter (`client_address <> a.owner`).
      //
      // The contract clears the wallet AND all metadata on transfer
      // (`clear_all_metadata`) but emits only a single agentWallet MetadataSet
      // (handled as AgentWalletUnset above) — the other metadata keys get NO
      // per-key event, so the indexer must delete them here to mirror on-chain
      // state. `wallet: null` is set redundantly (the AgentWalletUnset from the
      // same tx already nulls it) for ordering/idempotency safety.
      if (event.agentId == null || !event.to) {
        logMalformedEvent('identity', 'AgentTransferred', event);
        return;
      }

      // Single transaction (migration 047): the owner change + metadata clear
      // commit together, so the mirror is never observed mid-transfer with the
      // new owner but the prior owner's metadata still attached. The RPC is
      // ledger-guarded (transferred_ledger), so a replayed/older transfer can
      // neither regress ownership nor wipe current metadata.
      const result = await db.rpc('apply_agent_transfer', {
        p_agent_id: event.agentId,
        p_to: event.to,
        p_ledger: event.ledger,
      });

      assertNoError(result, `[identity] failed to apply transfer for agent ${event.agentId}`);
      break;
    }
  }
}

export async function writeReputationEvent(
  db: SupabaseClient,
  event: ReputationEvent,
): Promise<void> {
  switch (event.type) {
    case 'NewFeedback': {
      if (event.agentId == null || !event.clientAddress) {
        logMalformedEvent('reputation', 'NewFeedback', event);
        return;
      }

      const result = await db.from('feedback').upsert(
        {
          agent_id: event.agentId,
          client_address: event.clientAddress,
          feedback_index: toDbBigint(event.feedbackIndex),
          value: event.value.toString(),
          value_decimals: event.valueDecimals,
          tag1: event.tag1 || null,
          tag2: event.tag2 || null,
          endpoint: event.endpoint || null,
          feedback_uri: event.feedbackUri || null,
          feedback_hash: event.feedbackHash || null,
          created_at: event.ledgerClosedAt,
          created_ledger: event.ledger,
          tx_hash: event.txHash,
        },
        { onConflict: 'agent_id,client_address,feedback_index' },
      );

      assertNoError(
        result,
        `[reputation] failed to upsert feedback ${event.agentId}:${event.clientAddress}:${event.feedbackIndex}`,
      );
      break;
    }

    case 'FeedbackRevoked': {
      if (event.agentId == null || !event.clientAddress) {
        logMalformedEvent('reputation', 'FeedbackRevoked', event);
        return;
      }

      // Ledger-guarded (revoked_ledger, migration 046): monotonic + reorder-safe.
      // Feedback is append-only; revocation is a state flag, never a delete.
      const result = await db
        .from('feedback')
        .update({ is_revoked: true, revoked_ledger: event.ledger })
        .eq('agent_id', event.agentId)
        .eq('client_address', event.clientAddress)
        .eq('feedback_index', toDbBigint(event.feedbackIndex))
        .or(`revoked_ledger.is.null,revoked_ledger.lte.${event.ledger}`);

      assertNoError(
        result,
        `[reputation] failed to revoke feedback ${event.agentId}:${event.clientAddress}:${event.feedbackIndex}`,
      );
      break;
    }

    case 'ResponseAppended': {
      if (
        event.agentId == null ||
        !event.clientAddress ||
        !event.responder
      ) {
        logMalformedEvent('reputation', 'ResponseAppended', event);
        return;
      }

      const result = await db.rpc('insert_feedback_response', {
        p_agent_id: event.agentId,
        p_client_address: event.clientAddress,
        p_feedback_index: toDbBigint(event.feedbackIndex),
        p_responder: event.responder,
        p_response_uri: event.responseUri || null,
        p_response_hash: event.responseHash || null,
        p_created_at: event.ledgerClosedAt,
        p_tx_hash: event.txHash,
        p_event_id: event.eventId,
      });

      assertNoError(
        result,
        `[reputation] failed to insert response for ${event.agentId}:${event.clientAddress}:${event.feedbackIndex}`,
      );
      break;
    }
  }
}

export async function writeValidationEvent(
  db: SupabaseClient,
  event: ValidationEvent,
): Promise<void> {
  switch (event.type) {
    case 'ValidationRequest': {
      // Spec compliance pass: renamed from `ValidationRequested` to match
      // the ERC-8004 `ValidationRequest` event name (no past-tense suffix).
      if (!event.requestHash || event.agentId == null || !event.validatorAddress) {
        logMalformedEvent('validation', 'ValidationRequest', event);
        return;
      }

      const result = await db.from('validations').upsert(
        {
          request_hash: event.requestHash,
          agent_id: event.agentId,
          validator_address: event.validatorAddress,
          request_uri: event.requestUri || null,
          created_at: event.ledgerClosedAt,
          request_tx_hash: event.txHash,
        },
        { onConflict: 'request_hash' },
      );

      assertNoError(
        result,
        `[validation] failed to upsert request ${event.requestHash}`,
      );
      break;
    }

    case 'ValidationResponse': {
      // Spec parity (canonical erc-8004): renamed from `ValidationResponded`.
      // The contract overwrites the response in place (validation_response sets
      // status.response, contract.rs), so this UPDATE faithfully mirrors that.
      // The ledger guard (response_ledger, migration 046) makes the overwrite
      // monotonic — a stale/replayed older response can no longer clobber a
      // newer one; we do NOT rely on RPC ledger-ordering for correctness.
      if (!event.requestHash || event.response == null) {
        logMalformedEvent('validation', 'ValidationResponse', event);
        return;
      }

      const result = await db
        .from('validations')
        .update({
          response: event.response,
          response_uri: event.responseUri || null,
          response_hash: event.responseHash || null,
          tag: event.tag || null,
          has_response: true,
          responded_at: event.ledgerClosedAt,
          response_tx_hash: event.txHash,
          response_ledger: event.ledger,
        })
        .eq('request_hash', event.requestHash)
        .or(`response_ledger.is.null,response_ledger.lte.${event.ledger}`);

      assertNoError(
        result,
        `[validation] failed to update response ${event.requestHash}`,
      );
      break;
    }
  }
}

// --- Bulk writers (homogeneous-page fast path) ----------------------------
//
// Each per-event writer above issues one PostgREST round-trip. When a page's
// events are ALL the same pure-upsert type — the dominant backfill shape (long
// runs of NewFeedback / ValidationRequest / Registered) — the indexer collapses
// the whole page into ONE multi-row upsert via these variants, cutting the
// round-trips ~page-size-fold. The indexer only calls a bulk writer when every
// event on the page parsed to that type; on any failure it falls back to the
// per-event path (which keeps FK-defer / skip-after-N handling and re-applies
// idempotently, since a failed PostgREST statement rolls back wholesale).

type RegisteredEvent = Extract<IdentityEvent, { type: 'Registered' }>;
type MetadataSetEvent = Extract<IdentityEvent, { type: 'MetadataSet' }>;
type NewFeedbackEvent = Extract<ReputationEvent, { type: 'NewFeedback' }>;
type ValidationRequestEvent = Extract<ValidationEvent, { type: 'ValidationRequest' }>;

// A single PostgREST upsert array cannot carry two rows with the same
// ON CONFLICT key (Postgres: "ON CONFLICT DO UPDATE command cannot affect row
// a second time"). Events arrive in ledger order, so keeping the LAST row per
// key mirrors the final on-chain state — identical to replaying per-event.
function dedupeKeepLast<T>(rows: T[], key: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(key(row), row);
  return [...byKey.values()];
}

// Cap rows per PostgREST statement. A single homogeneous page can carry up to
// EVENTS_PAGE_LIMIT events, each up to the on-chain 4KB metadata/URI cap, so an
// un-chunked bulk upsert could balloon into one multi-MB INSERT ... ON CONFLICT
// that trips statement-size / memory / time limits. Splitting it bounds each
// statement regardless of page size. Chunks are upserted sequentially; if a
// later chunk fails, the writer throws and the indexer falls back to the
// per-event path, which re-applies every row idempotently (all writes are
// upserts), so an already-applied earlier chunk is harmless.
const BULK_CHUNK_SIZE = 500;

async function upsertChunked(
  db: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  options: { onConflict: string; ignoreDuplicates?: boolean },
  context: string,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += BULK_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + BULK_CHUNK_SIZE);
    const result = await db.from(table).upsert(chunk, options);
    assertNoError(result, `${context} (rows ${offset}-${offset + chunk.length})`);
  }
}

export async function bulkUpsertRegistered(
  db: SupabaseClient,
  events: IdentityEvent[],
): Promise<void> {
  const rows = events
    .filter((e): e is RegisteredEvent => e.type === 'Registered' && e.agentId != null && !!e.owner)
    .map((e) => ({
      id: e.agentId,
      owner: e.owner,
      agent_uri: e.agentUri,
      agent_uri_data: null,
      uri_resolve_attempts: 0,
      resolve_uri_pending: typeof e.agentUri === 'string' && e.agentUri.length > 0,
      created_at: e.ledgerClosedAt,
      created_ledger: e.ledger,
      tx_hash: e.txHash,
    }));
  if (rows.length === 0) return;
  const deduped = dedupeKeepLast(rows, (r) => String(r.id));
  // ignoreDuplicates mirrors the per-event Registered path: a replay must not
  // clobber resolver state (agent_uri_data, resolve_uri_pending, ...).
  await upsertChunked(
    db,
    'agents',
    deduped,
    { onConflict: 'id', ignoreDuplicates: true },
    '[identity] bulk Registered upsert failed',
  );
}

export async function bulkUpsertMetadataSet(
  db: SupabaseClient,
  events: IdentityEvent[],
): Promise<void> {
  const rows = events
    .filter((e): e is MetadataSetEvent => e.type === 'MetadataSet' && e.agentId != null && !!e.key)
    .map((e) => ({
      agent_id: e.agentId,
      key: e.key,
      value: typeof e.value === 'string' ? e.value : utf8Decoder.decode(e.value),
    }));
  if (rows.length === 0) return;
  const deduped = dedupeKeepLast(rows, (r) => `${r.agent_id}:${r.key}`);
  await upsertChunked(
    db,
    'agent_metadata',
    deduped,
    { onConflict: 'agent_id,key' },
    '[identity] bulk MetadataSet upsert failed',
  );
}

export async function bulkUpsertNewFeedback(
  db: SupabaseClient,
  events: ReputationEvent[],
): Promise<void> {
  const rows = events
    .filter(
      (e): e is NewFeedbackEvent =>
        e.type === 'NewFeedback' && e.agentId != null && !!e.clientAddress,
    )
    .map((e) => ({
      agent_id: e.agentId,
      client_address: e.clientAddress,
      feedback_index: toDbBigint(e.feedbackIndex),
      value: e.value.toString(),
      value_decimals: e.valueDecimals,
      tag1: e.tag1 || null,
      tag2: e.tag2 || null,
      endpoint: e.endpoint || null,
      feedback_uri: e.feedbackUri || null,
      feedback_hash: e.feedbackHash || null,
      created_at: e.ledgerClosedAt,
      created_ledger: e.ledger,
      tx_hash: e.txHash,
    }));
  if (rows.length === 0) return;
  const deduped = dedupeKeepLast(
    rows,
    (r) => `${r.agent_id}:${r.client_address}:${r.feedback_index}`,
  );
  await upsertChunked(
    db,
    'feedback',
    deduped,
    { onConflict: 'agent_id,client_address,feedback_index' },
    '[reputation] bulk NewFeedback upsert failed',
  );
}

export async function bulkUpsertValidationRequest(
  db: SupabaseClient,
  events: ValidationEvent[],
): Promise<void> {
  const rows = events
    .filter(
      (e): e is ValidationRequestEvent =>
        e.type === 'ValidationRequest' &&
        !!e.requestHash &&
        e.agentId != null &&
        !!e.validatorAddress,
    )
    .map((e) => ({
      request_hash: e.requestHash,
      agent_id: e.agentId,
      validator_address: e.validatorAddress,
      request_uri: e.requestUri || null,
      created_at: e.ledgerClosedAt,
      request_tx_hash: e.txHash,
    }));
  if (rows.length === 0) return;
  const deduped = dedupeKeepLast(rows, (r) => String(r.request_hash));
  await upsertChunked(
    db,
    'validations',
    deduped,
    { onConflict: 'request_hash' },
    '[validation] bulk ValidationRequest upsert failed',
  );
}

export async function refreshLeaderboard(db: SupabaseClient): Promise<void> {
  const result = await db.rpc('refresh_leaderboard');
  assertNoError(result, '[leaderboard] failed to refresh materialized view');
}
