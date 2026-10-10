import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexerStore, deploymentBinding, type Stream } from './db.js';
import { TESTNET } from './config.js';
import type { EventPacket } from './events.js';

let replies: { status?: number; body: unknown }[];
let requests: { path: string; body: unknown }[];
function store(signal?: AbortSignal) {
  const db = createClient('http://localhost:54321', 'test-service-key', {
    auth: { persistSession: false },
    global: {
      fetch: async (url, init) => {
        if (init?.signal?.aborted) throw new Error('aborted');
        requests.push({
          path: new URL(String(url)).pathname,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        const reply = replies.shift();
        if (!reply) throw new Error('unexpected request');
        return new Response(JSON.stringify(reply.body), {
          status: reply.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });
  return new IndexerStore(db, 'owner', deploymentBinding(TESTNET), signal);
}
const stream: Stream<{ lastLedger: number }> = {
  id: 'live:identity',
  source: 'source',
  revision: 3,
  state: { lastLedger: 10 },
  updatedAt: '',
};

beforeEach(() => {
  replies = [];
  requests = [];
});
describe('fenced indexer store', () => {
  it('forces the historical rebuild while keeping live refreshes throttled', async () => {
    replies.push({ body: null }, { body: null });
    const db = store();
    await db.refreshLeaderboard('force');
    await db.refreshLeaderboard();
    expect(requests.map((request) => request.path)).toEqual([
      '/rest/v1/rpc/refresh_leaderboard_force',
      '/rest/v1/rpc/refresh_leaderboard',
    ]);
  });
  it('surfaces a failed forced refresh instead of treating it as completion', async () => {
    replies.push({ status: 500, body: { code: '57014', message: 'refresh timed out' } });
    await expect(store().refreshLeaderboard('force')).rejects.toThrow(/refresh timed out/);
  });
  it('passes the lease and deployment into a single atomic event/progress RPC without losing bigint precision', async () => {
    replies.push({ body: { applied: 1, superseded: 0, revision: 4 } });
    const event: EventPacket = {
      id: '0000000047244644352-0000000000',
      contract: 'reputation',
      data: {
        type: 'NewFeedback',
        agentId: 1,
        clientAddress: 'client',
        feedbackIndex: 9007199254740993n,
        value: 170141183460469231731687303715884105727n,
        valueDecimals: 0,
        tag1: '',
        tag2: '',
        endpoint: '',
        feedbackUri: '',
        feedbackHash: '',
        ledger: 11,
        ledgerClosedAt: '2026-10-10T00:00:00Z',
        txHash: 'hash',
      },
    };
    const result = await store().commit(stream, [event], { lastLedger: 11 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      path: '/rest/v1/rpc/commit_indexer_batch',
      body: {
        p_owner: 'owner',
        p_binding: deploymentBinding(TESTNET),
        p_revision: 3,
        p_progress: { lastLedger: 11 },
        p_events: [
          {
            data: {
              feedbackIndex: '9007199254740993',
              value: '170141183460469231731687303715884105727',
            },
          },
        ],
      },
    });
    expect(result.stream).toMatchObject({ revision: 4, state: { lastLedger: 11 } });
    expect(stream.revision).toBe(3);
  });
  it('never advances local progress after an HTTP/SQL failure, including missing parents', async () => {
    replies.push({
      status: 409,
      body: { code: '23503', message: 'missing prerequisite: feedback' },
    });
    await expect(store().commit(stream, [], { lastLedger: 11 })).rejects.toThrow(
      /missing prerequisite/,
    );
    expect(stream.state?.lastLedger).toBe(10);
  });
  it('treats only a successful false acquire response as contention', async () => {
    replies.push(
      { body: false },
      { body: null },
      { status: 500, body: { message: 'connection lost' } },
    );
    const db = store();
    expect(await db.acquire('live')).toBe(false);
    await expect(db.acquire('live')).rejects.toThrow(/acquisition result/);
    await expect(db.acquire('live')).rejects.toThrow(/connection lost/);
  });
  it('rejects a source mismatch on read and never starts a fresh cursor for it', async () => {
    replies.push({ body: { source: 'old-source', state: { lastLedger: 10 }, revision: 3 } });
    await expect(store().read('live:identity', 'new-source')).rejects.toThrow(/source mismatch/);
  });
  it('propagates a returned release error', async () => {
    replies.push({ status: 500, body: { message: 'release failed' } });
    await expect(store().release()).rejects.toThrow(/release failed/);
  });
  it('does not send a protected write after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(store(controller.signal).commit(stream, [], { lastLedger: 11 })).rejects.toThrow();
    expect(requests).toEqual([]);
  });
  it('rejects an incomplete commit receipt rather than certifying progress', async () => {
    replies.push({ body: { applied: 0, superseded: 0 } });
    await expect(store().commit(stream, [], { lastLedger: 11 })).rejects.toThrow(/receipt/);
  });
});
