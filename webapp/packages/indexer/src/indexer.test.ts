import { Contract, nativeToScVal, type rpc } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TESTNET } from './config.js';
import { indexLive } from './indexer.js';
import { canonicalEventId } from './historical-source.js';
import { IndexerWriteError, sourceIdentity } from './db.js';
import { transactionWithEvents } from './__tests__/transactions.js';
import { MemoryStore } from './__tests__/memory-store.js';
import { BudgetExceeded, type WorkBudget } from './runtime.js';

const config = { ...TESTNET, deployLedger: 10 };
let store: MemoryStore;
let stopped: boolean;
let budget: WorkBudget;
const getEvents = vi.fn<(r: rpc.Api.GetEventsRequest) => Promise<rpc.Api.GetEventsResponse>>();
const getTransaction = vi.fn();
function event(index: number, name = 'registered', agent = index): rpc.Api.EventResponse {
  return {
    id: canonicalEventId(10, 1, 0, index),
    ledger: 10,
    transactionIndex: 1,
    operationIndex: 0,
    type: 'contract',
    contractId: new Contract(config.contracts.identity),
    inSuccessfulContractCall: true,
    ledgerClosedAt: '2026-10-10T00:00:00Z',
    txHash: 'a'.repeat(64),
    topic: [
      nativeToScVal(name, { type: 'symbol' }),
      nativeToScVal(agent, { type: 'u32' }),
      nativeToScVal('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4', {
        type: 'address',
      }),
    ],
    value: nativeToScVal({ agent_uri: 'uri' }),
  };
}
function page(
  events: rpc.Api.EventResponse[],
  oldest = 10,
  latest = 10,
): rpc.Api.GetEventsResponse {
  return {
    events,
    cursor: events.at(-1)?.id ?? 'end',
    oldestLedger: oldest,
    latestLedger: latest,
    oldestLedgerCloseTime: '',
    latestLedgerCloseTime: '',
  };
}
function run() {
  return indexLive({ config, store, rpc: { getEvents, getTransaction }, budget, head: 10 });
}

beforeEach(() => {
  store = new MemoryStore();
  stopped = false;
  budget = {
    expired: () => stopped,
    check: () => {
      if (stopped) throw new BudgetExceeded();
    },
  };
  getEvents.mockReset();
  getTransaction.mockReset();
  getEvents.mockResolvedValue(page([]));
});
describe('bounded live indexing', () => {
  it('does not skip a later event beyond RPC’s 10,000-ledger scan window', async () => {
    const later = { ...event(1), ledger: 15000, id: canonicalEventId(15000, 1, 0, 1) };
    getEvents.mockImplementation(async (q) => {
      if (q.limit === 1) return page([], 10, 20010);
      const identity = q.filters[0].contractIds![0] === config.contracts.identity;
      if (identity && q.startLedger != null && q.startLedger >= 10010 && q.startLedger <= 15000)
        return page([later], 10, 20010);
      // An empty response only certifies the actual 10k-ledger window,
      // regardless of the response's advertised head.
      return page([], 10, 20010);
    });
    const result = await indexLive({
      config,
      store,
      rpc: { getEvents, getTransaction },
      budget,
      head: 20010,
    });
    expect(result.errors).toBe(0);
    expect(store.events.map((e) => e.id)).toContain(later.id);
    expect(result.contracts.identity.lastLedger).toBe(20010);
    for (const [q] of getEvents.mock.calls)
      if (q.endLedger != null) expect(q.endLedger - q.startLedger!).toBeLessThanOrEqual(10000);
  });
  it('resolves initialization whose Registered event is on a later live page', async () => {
    const wallet = event(0, 'metadata_set', 7);
    wallet.topic[2] = nativeToScVal('agentWallet');
    wallet.value = nativeToScVal({
      value: new TextEncoder().encode('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4'),
    });
    const metadata = event(1, 'metadata_set', 7);
    metadata.topic[2] = nativeToScVal('key');
    metadata.value = nativeToScVal({ value: new TextEncoder().encode('value') });
    const registered = event(2, 'registered', 7);
    getTransaction.mockResolvedValue(transactionWithEvents([wallet, metadata, registered]));
    getEvents.mockImplementation(async (q) => {
      if (q.limit === 1 || q.filters[0].contractIds![0] !== config.contracts.identity)
        return page([]);
      if (!q.cursor) return page([wallet, metadata]);
      return q.cursor === metadata.id ? page([registered]) : page([]);
    });
    expect((await run()).errors).toBe(0);
    expect(getTransaction).toHaveBeenCalledTimes(1);
    expect(store.events.slice(0, 3).map((e) => e.data.type)).toEqual([
      'Registered',
      'AgentWalletSet',
      'MetadataSet',
    ]);
    expect(store.streams.get('live:identity')?.state).toMatchObject({ lastLedger: 10 });
  });
  it('reloads a committed cursor after losing its HTTP acknowledgement', async () => {
    getEvents.mockImplementation(async (q) =>
      q.limit === 1 || q.cursor || q.filters[0].contractIds![0] !== config.contracts.identity
        ? page([])
        : page([event(1)]),
    );
    const commit = store.commit.bind(store);
    let lost = false;
    vi.spyOn(store, 'commit').mockImplementation(async (stream, events, state, gap) => {
      const committed = await commit(stream, events, state, gap);
      if (events.length && !lost) {
        lost = true;
        throw new IndexerWriteError('response lost');
      }
      return committed;
    });
    expect((await run()).errors).toBe(1);
    expect((await run()).errors).toBe(0);
    expect(store.events).toHaveLength(1);
    expect(store.streams.get('live:identity')?.state).toMatchObject({ lastLedger: 10 });
  });
  it.each([10009, 10010])('honors the exact 10k scan boundary at target %s', async (head) => {
    getEvents.mockResolvedValue(page([], 10, head));
    const result = await indexLive({
      config,
      store,
      rpc: { getEvents, getTransaction },
      budget,
      head,
    });
    expect(result.errors).toBe(0);
    const scans = getEvents.mock.calls.filter(
      ([q]) => q.limit !== 1 && q.filters[0].contractIds![0] === config.contracts.identity,
    );
    expect(scans).toHaveLength(head === 10009 ? 1 : 2);
  });
  it('starts the next invocation with a contract the previous budget did not reach', async () => {
    store.afterCommit = () => {
      stopped = true;
    };
    await run();
    stopped = false;
    getEvents.mockClear();
    await run();
    const firstScan = getEvents.mock.calls.find(([q]) => q.limit !== 1)![0];
    expect(firstScan.filters[0].contractIds![0]).toBe(config.contracts.reputation);
  });
  it('certifies an empty range only through an RPC response covering its fixed target', async () => {
    const result = await run();
    expect(result.errors).toBe(0);
    for (const name of ['identity', 'reputation', 'validation']) {
      expect(store.streams.get(`live:${name}`)?.state).toMatchObject({
        lastLedger: 10,
        targetLedger: 10,
        cursor: null,
      });
    }
    expect(getEvents.mock.calls.some(([q]) => q.startLedger === 10 && q.endLedger === 11)).toBe(
      true,
    );
  });
  it('makes durable progress within one busy ledger and services other contracts between pages', async () => {
    const ids: string[] = [];
    let identityPages = 0;
    getEvents.mockImplementation(async (q) => {
      const id = q.filters[0].contractIds![0];
      ids.push(id);
      if (q.limit === 1) return page([]); // retention probe
      if (id !== config.contracts.identity) return page([]);
      identityPages++;
      return identityPages <= 3 ? page([event(identityPages)]) : page([]);
    });
    let commits = 0;
    store.afterCommit = () => {
      if (++commits === 3) stopped = true;
    };
    expect((await run()).timedOut).toBe(true);
    expect(store.streams.get('live:identity')?.state).toMatchObject({
      lastLedger: 0,
      cursor: event(1).id,
    });
    expect(ids.indexOf(config.contracts.reputation)).toBeGreaterThan(-1);
    stopped = false;
    store.afterCommit = undefined;
    const result = await run();
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(getEvents.mock.calls.some(([q]) => q.cursor === event(1).id)).toBe(true);
    expect(store.events.map((e) => e.id)).toEqual([event(1).id, event(2).id, event(3).id]);
  });
  it('retains the failing page after any number of database outages', async () => {
    getEvents.mockImplementation(async (q) =>
      q.limit === 1 || q.filters[0].contractIds![0] !== config.contracts.identity
        ? page([])
        : page([event(1)]),
    );
    store.failure = new Error('database unavailable');
    for (let i = 0; i < 7; i++) expect((await run()).skippedEvents).toBe(0);
    expect(store.events).toEqual([]);
    expect(store.streams.size).toBe(0);
  });
  it('keeps prior page progress when a later recognized event is invalid', async () => {
    const invalid = event(2);
    invalid.value = nativeToScVal({});
    let n = 0;
    getEvents.mockImplementation(async (q) =>
      q.limit === 1 || q.filters[0].contractIds![0] !== config.contracts.identity
        ? page([])
        : page([++n === 1 ? event(1) : invalid]),
    );
    const result = await run();
    expect(result.errors).toBe(1);
    expect(store.events).toHaveLength(1);
    expect(store.streams.get('live:identity')?.state).toMatchObject({
      lastLedger: 0,
      cursor: event(1).id,
    });
  });
  it('records a cold-start retention gap atomically with its new starting point', async () => {
    getEvents.mockResolvedValue(page([], 12, 12));
    await indexLive({ config, store, rpc: { getEvents, getTransaction }, budget, head: 12 });
    expect(store.gaps).toHaveLength(3);
    expect(store.gaps[0]).toMatchObject({ startLedger: 10, endLedger: 12 });
    store = new MemoryStore();
    store.failure = new Error('gap insert failed');
    await indexLive({ config, store, rpc: { getEvents, getTransaction }, budget, head: 12 });
    expect(store.streams.size).toBe(0);
  });
  it('never lets a diagnostic commit acknowledge a failed gap record', async () => {
    getEvents.mockResolvedValue(page([], 12, 12));
    const commit = store.commit.bind(store);
    vi.spyOn(store, 'commit').mockImplementation(async (stream, events, state, gap) => {
      if (gap) throw new IndexerWriteError('gap insert failed', '53300');
      return commit(stream, events, state, gap);
    });
    await indexLive({ config, store, rpc: { getEvents, getTransaction }, budget, head: 12 });
    expect(store.gaps).toEqual([]);
    expect(store.streams.get('live:identity')?.state).toMatchObject({
      lastLedger: 0,
      startLedger: 10,
      resumeLedger: 10,
    });
  });
  it('does not write an in-flight response after cancellation', async () => {
    getEvents.mockImplementation(async (q) => {
      if (q.limit === 1) return page([]);
      stopped = true;
      return page([event(1)]);
    });
    expect((await run()).timedOut).toBe(true);
    expect(store.events).toEqual([]);
  });
  it('rejects a nonadvancing or out-of-order page instead of looping forever', async () => {
    getEvents.mockImplementation(async (q) =>
      q.limit === 1 || q.filters[0].contractIds![0] !== config.contracts.identity
        ? page([])
        : page([event(2), event(1)]),
    );
    expect((await run()).errors).toBe(1);
    expect(store.events).toEqual([]);
  });
  it('keeps a source-bound resume token from being reused against another endpoint', async () => {
    store.streams.set('live:identity', {
      id: 'live:identity',
      source: 'old source',
      revision: 1,
      state: {},
      updatedAt: '',
    });
    expect((await run()).errors).toBe(1);
    expect(store.streams.get('live:identity')?.source).not.toBe(sourceIdentity(config));
  });
  it('acknowledges unrelated and unsuccessful input without turning it into writes', async () => {
    let n = 0;
    const failed = event(1);
    failed.inSuccessfulContractCall = false;
    getEvents.mockImplementation(async (q) =>
      q.limit === 1 || q.filters[0].contractIds![0] !== config.contracts.identity || n++ > 0
        ? page([])
        : page([failed, event(2, 'unrelated')]),
    );
    expect((await run()).errors).toBe(0);
    expect(store.events).toEqual([]);
    expect(store.streams.get('live:identity')?.state).toMatchObject({ lastLedger: 10 });
  });
});
