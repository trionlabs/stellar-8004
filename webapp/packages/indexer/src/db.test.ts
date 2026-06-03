import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  IndexerWriteError,
  isRetryableWriteError,
  writeIdentityEvent,
  writeReputationEvent,
} from './db.js';
import type { IdentityEvent } from './parsers/identity.js';
import type { ReputationEvent } from './parsers/reputation.js';

/**
 * Minimal chainable Supabase test double. Every terminal call (`upsert`,
 * `update`, `rpc`) resolves to `{ error }`; `eq` returns the same thenable so
 * `.update(...).eq(...).eq(...)` works. Records the last operation for asserts.
 */
function fakeDb(error: { message: string; code?: string } | null = null) {
  const calls: Array<{ table?: string; op: string; payload?: unknown; opts?: unknown }> = [];
  const result = { error };

  const thenable = (op: string, table?: string, payload?: unknown, opts?: unknown) => {
    calls.push({ table, op, payload, opts });
    const chain: Record<string, unknown> = {
      eq: vi.fn(() => chain),
      then: (resolve: (v: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };

  const db = {
    from: vi.fn((table: string) => ({
      upsert: (payload: unknown, opts: unknown) => thenable('upsert', table, payload, opts),
      update: (payload: unknown) => thenable('update', table, payload),
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

  it('moves owner to the recipient and clears metadata on AgentTransferred', async () => {
    const { db, calls } = fakeDb();
    await writeIdentityEvent(db, {
      type: 'AgentTransferred',
      ...base,
      from: 'GFROM',
      to: 'GTO',
    });

    // owner follows the NFT; wallet is nulled (contract clears it on transfer).
    const update = calls.find((c) => c.op === 'update' && c.table === 'agents');
    expect(update?.payload).toEqual({ owner: 'GTO', wallet: null });
    // The contract's clear_all_metadata emits no per-key event, so the indexer
    // must delete the orphaned metadata rows itself.
    const del = calls.find((c) => c.op === 'delete' && c.table === 'agent_metadata');
    expect(del).toBeDefined();
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
