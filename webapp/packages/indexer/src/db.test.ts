import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  bulkUpsertMetadataSet,
  bulkUpsertNewFeedback,
  bulkUpsertRegistered,
  bulkUpsertValidationRequest,
  IndexerWriteError,
  isRetryableWriteError,
  recordDeadLetter,
  updateCheckpoint,
  writeIdentityEvent,
  writeReputationEvent,
  writeValidationEvent,
} from './db.js';
import type { IdentityEvent } from './parsers/identity.js';
import type { ReputationEvent } from './parsers/reputation.js';
import type { ValidationEvent } from './parsers/validation.js';

/**
 * Minimal chainable Supabase test double. Every terminal call (`upsert`,
 * `update`, `rpc`) resolves to `{ error }`; `eq` returns the same thenable so
 * `.update(...).eq(...).eq(...)` works. Records the last operation for asserts.
 */
function fakeDb(error: { message: string; code?: string } | null = null) {
  const calls: Array<{
    table?: string;
    op: string;
    payload?: unknown;
    opts?: unknown;
    filters: string[];
  }> = [];
  const result = { error };

  const thenable = (op: string, table?: string, payload?: unknown, opts?: unknown) => {
    const record = { table, op, payload, opts, filters: [] as string[] };
    calls.push(record);
    const chain: Record<string, unknown> = {
      eq: vi.fn((col: string, val: unknown) => {
        record.filters.push(`eq:${col}:${val}`);
        return chain;
      }),
      or: vi.fn((expr: string) => {
        record.filters.push(`or:${expr}`);
        return chain;
      }),
      then: (resolve: (v: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };

  const db = {
    from: vi.fn((table: string) => ({
      upsert: (payload: unknown, opts: unknown) => thenable('upsert', table, payload, opts),
      update: (payload: unknown) => thenable('update', table, payload),
      insert: (payload: unknown) => thenable('insert', table, payload),
      delete: () => thenable('delete', table),
    })),
    rpc: vi.fn((name: string, payload: unknown) => thenable(`rpc:${name}`, undefined, payload)),
  } as unknown as SupabaseClient;

  return { db, calls };
}

const base = {
  agentId: 1,
  ledger: 100,
  ledgerClosedAt: '2026-04-03T12:00:00Z',
  txHash: 'a'.repeat(64),
};

describe('writeIdentityEvent', () => {
  it('upserts a Registered agent with ignoreDuplicates so replay is non-destructive', async () => {
    const { db, calls } = fakeDb();
    const event: IdentityEvent = {
      type: 'Registered',
      ...base,
      owner: 'GAAAA',
      agentUri: 'https://example.com/agent.json',
    };

    await writeIdentityEvent(db, event);

    const upsert = calls.find((c) => c.op === 'upsert');
    expect(upsert?.table).toBe('agents');
    // The replay-safety fix: ON CONFLICT DO NOTHING so resolved URI state is
    // not clobbered when a Registered event is re-processed.
    expect(upsert?.opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect((upsert?.payload as { resolve_uri_pending?: boolean }).resolve_uri_pending).toBe(true);
  });

  it('does not arm URI resolution for a Registered agent with an empty URI', async () => {
    const { db, calls } = fakeDb();
    await writeIdentityEvent(db, {
      type: 'Registered',
      ...base,
      owner: 'GAAAA',
      agentUri: '',
    });

    const upsert = calls.find((c) => c.op === 'upsert');
    expect((upsert?.payload as { resolve_uri_pending?: boolean }).resolve_uri_pending).toBe(false);
  });

  it('skips a malformed Registered event without writing', async () => {
    const { db, calls } = fakeDb();
    await writeIdentityEvent(db, {
      type: 'Registered',
      ...base,
      owner: '',
      agentUri: '',
    });

    expect(calls).toHaveLength(0);
  });

  it('routes an AgentWalletSet to the wallet column', async () => {
    const { db, calls } = fakeDb();
    await writeIdentityEvent(db, {
      type: 'AgentWalletSet',
      ...base,
      newWallet: 'GWALLET',
    });

    const update = calls.find((c) => c.op === 'update');
    expect(update?.table).toBe('agents');
    expect(update?.payload).toEqual({ wallet: 'GWALLET' });
  });

  it('clears the wallet column on AgentWalletUnset', async () => {
    const { db, calls } = fakeDb();
    await writeIdentityEvent(db, { type: 'AgentWalletUnset', ...base });

    const update = calls.find((c) => c.op === 'update');
    expect(update?.payload).toEqual({ wallet: null });
  });

  it('applies AgentTransferred atomically via the apply_agent_transfer RPC', async () => {
    const { db, calls } = fakeDb();
    await writeIdentityEvent(db, {
      type: 'AgentTransferred',
      ...base,
      from: 'GFROM',
      to: 'GTO',
    });

    // owner change + metadata clear are ONE transaction (migration 047), so the
    // writer issues a single ledger-guarded RPC, never a separate update+delete
    // that could be observed half-applied.
    const rpc = calls.find((c) => c.op === 'rpc:apply_agent_transfer');
    expect(rpc?.payload).toEqual({ p_agent_id: 1, p_to: 'GTO', p_ledger: 100 });
    expect(calls.some((c) => c.op === 'update' || c.op === 'delete')).toBe(false);
  });

  it('skips an AgentTransferred missing the recipient without writing', async () => {
    const { db, calls } = fakeDb();
    await writeIdentityEvent(db, {
      type: 'AgentTransferred',
      ...base,
      from: 'GFROM',
      to: '',
    });

    expect(calls).toHaveLength(0);
  });

  it('ledger-guards UriUpdated so a stale URI change cannot wipe newer resolved data', async () => {
    const { db, calls } = fakeDb();
    await writeIdentityEvent(db, {
      type: 'UriUpdated',
      ...base,
      updatedBy: 'GOWNER',
      newUri: 'ipfs://new',
    });

    const update = calls.find((c) => c.op === 'update' && c.table === 'agents');
    expect((update?.payload as { uri_updated_ledger?: number }).uri_updated_ledger).toBe(100);
    expect(update?.filters).toContain('or:uri_updated_ledger.is.null,uri_updated_ledger.lte.100');
  });

  it('throws a non-retryable IndexerWriteError on a generic DB error', async () => {
    const { db } = fakeDb({ message: 'boom' });
    await expect(
      writeIdentityEvent(db, { type: 'AgentWalletUnset', ...base }),
    ).rejects.toBeInstanceOf(IndexerWriteError);
  });
});

describe('writeReputationEvent', () => {
  it('maps a foreign-key violation to a retryable IndexerWriteError', async () => {
    const { db } = fakeDb({ message: 'insert or update violates fk', code: '23503' });
    const event: ReputationEvent = {
      type: 'NewFeedback',
      ...base,
      clientAddress: 'GCLIENT',
      feedbackIndex: 1n,
      value: 90n,
      valueDecimals: 0,
      tag1: '',
      tag2: '',
      endpoint: '',
      feedbackUri: '',
      feedbackHash: '',
    };

    const error = await writeReputationEvent(db, event).catch((e) => e);
    expect(error).toBeInstanceOf(IndexerWriteError);
    expect(isRetryableWriteError(error)).toBe(true);
  });

  it('ledger-guards FeedbackRevoked so an older revoke cannot overwrite newer state', async () => {
    const { db, calls } = fakeDb();
    await writeReputationEvent(db, {
      type: 'FeedbackRevoked',
      ...base,
      clientAddress: 'GCLIENT',
      feedbackIndex: 3n,
    });

    const update = calls.find((c) => c.op === 'update' && c.table === 'feedback');
    // Append-only: revocation is a flag, not a delete; and it is ledger-guarded.
    expect((update?.payload as { is_revoked?: boolean }).is_revoked).toBe(true);
    expect((update?.payload as { revoked_ledger?: number }).revoked_ledger).toBe(100);
    expect(update?.filters).toContain('or:revoked_ledger.is.null,revoked_ledger.lte.100');
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('routes a ResponseAppended through the atomic insert_feedback_response RPC', async () => {
    const { db, calls } = fakeDb();
    await writeReputationEvent(db, {
      type: 'ResponseAppended',
      ...base,
      clientAddress: 'GCLIENT',
      responder: 'GRESPONDER',
      feedbackIndex: 2n,
      responseUri: '',
      responseHash: '',
      eventId: '1000-0-0',
    });

    const rpc = calls.find((c) => c.op === 'rpc:insert_feedback_response');
    expect(rpc).toBeDefined();
    // The event id is forwarded as the idempotency key.
    expect((rpc?.payload as { p_event_id?: string }).p_event_id).toBe('1000-0-0');
  });
});

describe('writeValidationEvent', () => {
  it('ledger-guards ValidationResponse so a stale response cannot clobber a newer one', async () => {
    const { db, calls } = fakeDb();
    await writeValidationEvent(db, {
      type: 'ValidationResponse',
      ...base,
      validatorAddress: 'GVALIDATOR',
      requestHash: 'h1',
      response: 80,
      responseUri: '',
      responseHash: '',
      tag: '',
    });

    const update = calls.find((c) => c.op === 'update' && c.table === 'validations');
    expect((update?.payload as { response_ledger?: number }).response_ledger).toBe(100);
    expect(update?.filters).toContain('or:response_ledger.is.null,response_ledger.lte.100');
  });
});

describe('updateCheckpoint liveness', () => {
  it('stamps last_advanced_at when the checkpoint advances', async () => {
    const { db, calls } = fakeDb();
    await updateCheckpoint(db, 'identity', 200, 201, 0, true);
    const up = calls.find((c) => c.op === 'upsert' && c.table === 'indexer_state');
    expect((up?.payload as { last_advanced_at?: string }).last_advanced_at).toBeTypeOf('string');
  });

  it('omits last_advanced_at on a no-progress run so liveness reflects real progress', async () => {
    const { db, calls } = fakeDb();
    await updateCheckpoint(db, 'identity', 200, 201, 1, false);
    const up = calls.find((c) => c.op === 'upsert' && c.table === 'indexer_state');
    expect('last_advanced_at' in (up?.payload as object)).toBe(false);
    // updated_at is still bumped (the run happened); only progress is gated.
    expect((up?.payload as { updated_at?: string }).updated_at).toBeTypeOf('string');
  });
});

describe('recordDeadLetter', () => {
  it('durably inserts a dropped-event row', async () => {
    const { db, calls } = fakeDb();
    await recordDeadLetter(db, {
      contract: 'reputation',
      reason: 'skip-retryable',
      eventId: '1000-0-0',
      ledger: 50,
      detail: 'boom',
    });
    const ins = calls.find((c) => c.op === 'insert' && c.table === 'indexer_dead_letter');
    expect((ins?.payload as { reason?: string }).reason).toBe('skip-retryable');
    expect((ins?.payload as { event_id?: string }).event_id).toBe('1000-0-0');
  });

  it('never throws when the insert returns an error (best-effort, returned-error path)', async () => {
    const { db } = fakeDb({ message: 'dead-letter table missing' });
    await expect(
      recordDeadLetter(db, { contract: 'identity', reason: 'retention-clamp', ledger: 10 }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the insert call itself throws (best-effort, thrown path)', async () => {
    // A dead-letter failure must never re-wedge the loop it exists to observe,
    // so even a synchronous throw from the client is swallowed.
    const db = {
      from: () => ({ insert: () => { throw new Error('connection reset'); } }),
    } as unknown as SupabaseClient;
    await expect(
      recordDeadLetter(db, { contract: 'reputation', reason: 'skip-nonretryable', ledger: 7 }),
    ).resolves.toBeUndefined();
  });
});

// 8004 faithful-mirror invariant: the bulk fast path and the per-event path
// must produce BYTE-IDENTICAL rows, so the mirror is provably path-independent
// (a busy/backfill page and a quiet trickle index to the same state). This test
// fails the moment a future writer change diverges the two paths.
describe('bulk vs per-event write equivalence', () => {
  it('NewFeedback: bulk rows equal the per-event rows', async () => {
    const events: ReputationEvent[] = [
      { type: 'NewFeedback', ...base, clientAddress: 'GA', feedbackIndex: 1n, value: 80n, valueDecimals: 0, tag1: 'good', tag2: '', endpoint: '', feedbackUri: '', feedbackHash: '' },
      { type: 'NewFeedback', ...base, clientAddress: 'GB', feedbackIndex: 1n, value: 90n, valueDecimals: 2, tag1: '', tag2: 'x', endpoint: 'ep', feedbackUri: 'ipfs://f', feedbackHash: 'h' },
    ];

    const perEvent = fakeDb();
    for (const e of events) await writeReputationEvent(perEvent.db, e);
    const perRows = perEvent.calls
      .filter((c) => c.op === 'upsert' && c.table === 'feedback')
      .map((c) => c.payload);

    const bulk = fakeDb();
    await bulkUpsertNewFeedback(bulk.db, events);
    const bulkRows = bulk.calls.find((c) => c.op === 'upsert' && c.table === 'feedback')?.payload;

    expect(bulkRows).toEqual(perRows);
  });

  it('Registered: bulk rows equal the per-event rows', async () => {
    const events: IdentityEvent[] = [
      { type: 'Registered', ...base, owner: 'GA', agentUri: 'ipfs://x' },
      { type: 'Registered', agentId: 2, ledger: 101, ledgerClosedAt: base.ledgerClosedAt, txHash: base.txHash, owner: 'GB', agentUri: '' },
    ];

    const perEvent = fakeDb();
    for (const e of events) await writeIdentityEvent(perEvent.db, e);
    const perRows = perEvent.calls
      .filter((c) => c.op === 'upsert' && c.table === 'agents')
      .map((c) => c.payload);

    const bulk = fakeDb();
    await bulkUpsertRegistered(bulk.db, events);
    const bulkRows = bulk.calls.find((c) => c.op === 'upsert' && c.table === 'agents')?.payload;

    expect(bulkRows).toEqual(perRows);
  });

  it('MetadataSet: bulk rows equal the per-event rows', async () => {
    const events: IdentityEvent[] = [
      { type: 'MetadataSet', ...base, key: 'name', value: 'Alice' },
      { type: 'MetadataSet', agentId: 2, ledger: 101, ledgerClosedAt: base.ledgerClosedAt, txHash: base.txHash, key: 'url', value: 'https://x' },
    ];

    const perEvent = fakeDb();
    for (const e of events) await writeIdentityEvent(perEvent.db, e);
    const perRows = perEvent.calls
      .filter((c) => c.op === 'upsert' && c.table === 'agent_metadata')
      .map((c) => c.payload);

    const bulk = fakeDb();
    await bulkUpsertMetadataSet(bulk.db, events);
    const bulkRows = bulk.calls.find((c) => c.op === 'upsert' && c.table === 'agent_metadata')?.payload;

    expect(bulkRows).toEqual(perRows);
  });

  it('ValidationRequest: bulk rows equal the per-event rows', async () => {
    const events: ValidationEvent[] = [
      { type: 'ValidationRequest', ...base, validatorAddress: 'GV', requestHash: 'h1', requestUri: '' },
      { type: 'ValidationRequest', agentId: 2, ledger: 101, ledgerClosedAt: base.ledgerClosedAt, txHash: base.txHash, validatorAddress: 'GV2', requestHash: 'h2', requestUri: 'ipfs://r' },
    ];

    const perEvent = fakeDb();
    for (const e of events) await writeValidationEvent(perEvent.db, e);
    const perRows = perEvent.calls
      .filter((c) => c.op === 'upsert' && c.table === 'validations')
      .map((c) => c.payload);

    const bulk = fakeDb();
    await bulkUpsertValidationRequest(bulk.db, events);
    const bulkRows = bulk.calls.find((c) => c.op === 'upsert' && c.table === 'validations')?.payload;

    expect(bulkRows).toEqual(perRows);
  });
});

describe('retryable error classification', () => {
  it('maps lock_not_available (55P03) to a retryable IndexerWriteError', async () => {
    const { db } = fakeDb({ message: 'canceling statement due to lock timeout', code: '55P03' });
    const error = await writeIdentityEvent(db, { type: 'AgentWalletUnset', ...base }).catch((e) => e);
    expect(isRetryableWriteError(error)).toBe(true);
  });

  it('maps deadlock_detected (40P01) and serialization_failure (40001) to retryable', async () => {
    for (const code of ['40P01', '40001']) {
      const { db } = fakeDb({ message: 'transient', code });
      const error = await writeIdentityEvent(db, { type: 'AgentWalletUnset', ...base }).catch((e) => e);
      expect(isRetryableWriteError(error)).toBe(true);
    }
  });

  it('maps transient connection/timeout codes to retryable', async () => {
    // Genuinely transient infrastructure failures must defer, not drop.
    for (const code of ['08006', '53300', '57014', '57P01']) {
      const { db } = fakeDb({ message: 'transient', code });
      const error = await writeIdentityEvent(db, { type: 'AgentWalletUnset', ...base }).catch((e) => e);
      expect(isRetryableWriteError(error)).toBe(true);
    }
  });

  it('treats an unknown error code as non-retryable', async () => {
    const { db } = fakeDb({ message: 'syntax error', code: '42601' });
    const error = await writeIdentityEvent(db, { type: 'AgentWalletUnset', ...base }).catch((e) => e);
    expect(isRetryableWriteError(error)).toBe(false);
  });
});

describe('isRetryableWriteError', () => {
  it('is false for a non-retryable IndexerWriteError', () => {
    expect(isRetryableWriteError(new IndexerWriteError('x', false))).toBe(false);
  });

  it('is false for an arbitrary error', () => {
    expect(isRetryableWriteError(new Error('x'))).toBe(false);
  });
});

describe('bulk writers (homogeneous-page fast path)', () => {
  const fb = {
    type: 'NewFeedback' as const,
    ledger: 100,
    ledgerClosedAt: '2026-04-03T12:00:00Z',
    txHash: 'a'.repeat(64),
    valueDecimals: 0,
    tag1: '',
    tag2: '',
    endpoint: '',
    feedbackUri: '',
    feedbackHash: '',
  };

  it('collapses a page of NewFeedback into one multi-row upsert', async () => {
    const { db, calls } = fakeDb();
    const events: ReputationEvent[] = [
      { ...fb, agentId: 1, clientAddress: 'GA', feedbackIndex: 1n, value: 80n },
      { ...fb, agentId: 1, clientAddress: 'GB', feedbackIndex: 1n, value: 90n },
    ];

    await bulkUpsertNewFeedback(db, events);

    const upserts = calls.filter((c) => c.op === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe('feedback');
    expect(upserts[0].opts).toEqual({ onConflict: 'agent_id,client_address,feedback_index' });
    expect((upserts[0].payload as unknown[]).length).toBe(2);
  });

  it('dedupes a repeated conflict key within the page, keeping the last (ledger order)', async () => {
    const { db, calls } = fakeDb();
    const events: ReputationEvent[] = [
      { ...fb, agentId: 1, clientAddress: 'GA', feedbackIndex: 1n, value: 10n },
      { ...fb, agentId: 1, clientAddress: 'GA', feedbackIndex: 1n, value: 99n },
    ];

    await bulkUpsertNewFeedback(db, events);

    const rows = calls.find((c) => c.op === 'upsert')?.payload as Array<{ value: string }>;
    // A single PostgREST upsert array cannot repeat an ON CONFLICT key; last wins.
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('99');
  });

  it('writes nothing when every event is malformed', async () => {
    const { db, calls } = fakeDb();
    await bulkUpsertNewFeedback(db, [
      { ...fb, agentId: 1, clientAddress: '', feedbackIndex: 1n, value: 10n },
    ]);
    expect(calls).toHaveLength(0);
  });

  it('bulk-upserts Registered with ignoreDuplicates (replay-safe)', async () => {
    const { db, calls } = fakeDb();
    const events: IdentityEvent[] = [
      { type: 'Registered', agentId: 1, owner: 'GA', agentUri: 'ipfs://x', ledger: 100, ledgerClosedAt: 't', txHash: 'h' },
      { type: 'Registered', agentId: 2, owner: 'GB', agentUri: '', ledger: 101, ledgerClosedAt: 't', txHash: 'h' },
    ];

    await bulkUpsertRegistered(db, events);

    const upsert = calls.find((c) => c.op === 'upsert');
    expect(upsert?.table).toBe('agents');
    expect(upsert?.opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect((upsert?.payload as unknown[]).length).toBe(2);
  });

  it('bulk-upserts ValidationRequest deduped by request_hash', async () => {
    const { db, calls } = fakeDb();
    const events: ValidationEvent[] = [
      { type: 'ValidationRequest', agentId: 1, validatorAddress: 'GV', requestHash: 'h1', requestUri: '', ledger: 100, ledgerClosedAt: 't', txHash: 'h' },
      { type: 'ValidationRequest', agentId: 1, validatorAddress: 'GV', requestHash: 'h1', requestUri: '', ledger: 101, ledgerClosedAt: 't', txHash: 'h' },
    ];

    await bulkUpsertValidationRequest(db, events);

    const rows = calls.find((c) => c.op === 'upsert')?.payload as unknown[];
    expect(rows).toHaveLength(1);
  });

  it('chunks a page larger than the per-statement cap into multiple bounded upserts', async () => {
    const { db, calls } = fakeDb();
    // 501 distinct conflict keys (feedback_index 1..501) so dedupe keeps all of
    // them; the per-statement cap is 500, so this must split into 500 + 1 rather
    // than emit one unbounded multi-MB statement.
    const events: ReputationEvent[] = Array.from({ length: 501 }, (_, i) => ({
      ...fb,
      agentId: 1,
      clientAddress: 'GA',
      feedbackIndex: BigInt(i + 1),
      value: 80n,
    }));

    await bulkUpsertNewFeedback(db, events);

    const upserts = calls.filter((c) => c.op === 'upsert');
    expect(upserts).toHaveLength(2);
    expect((upserts[0].payload as unknown[]).length).toBe(500);
    expect((upserts[1].payload as unknown[]).length).toBe(1);
    expect(upserts.every((u) => u.table === 'feedback')).toBe(true);
    expect(upserts.every((u) => (u.opts as { onConflict: string }).onConflict === 'agent_id,client_address,feedback_index')).toBe(true);
  });
});
