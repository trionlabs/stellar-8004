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
    });

    expect(calls.some((c) => c.op === 'rpc:insert_feedback_response')).toBe(true);
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
