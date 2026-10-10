import { nativeToScVal, rpc, StrKey, xdr } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexHistory, type HistoricalState } from './backfill.js';
import { TESTNET } from './config.js';
import { MemoryStore } from './__tests__/memory-store.js';
import fixture from './__tests__/fixtures/rpc29-paired-v4.json';
import { BudgetExceeded, type WorkBudget } from './runtime.js';

const config = { ...TESTNET, deployLedger: 10 };
let store: MemoryStore;
let stopped: boolean;
let budget: WorkBudget;
const getTransactions =
  vi.fn<(r: rpc.Api.GetTransactionsRequest) => Promise<rpc.Api.GetTransactionsResponse>>();
function tx(count: number, ledger = 10, order = 1): rpc.Api.TransactionInfo {
  const raw = fixture.getTransactions.selectedTransaction;
  const events = Array.from(
    { length: count },
    (_, i) =>
      new xdr.ContractEvent({
        ext: xdr.ExtensionPoint.v0(),
        contractId: new xdr.ContractId(StrKey.decodeContract(config.contracts.identity)),
        type: xdr.ContractEventType.contract,
        body: xdr.ContractEventBody.v0(
          new xdr.ContractEventV0({
            topics: [
              nativeToScVal('registered', { type: 'symbol' }),
              nativeToScVal(i, { type: 'u32' }),
              nativeToScVal('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4', {
                type: 'address',
              }),
            ],
            data: nativeToScVal({ agent_uri: 'uri' }),
          }),
        ),
      }),
  );
  return {
    status: rpc.Api.GetTransactionStatus.SUCCESS,
    ledger,
    applicationOrder: order,
    createdAt: 1791619132,
    txHash: `${ledger}-${order}`,
    feeBump: false,
    envelopeXdr: xdr.TransactionEnvelope.fromXDR(raw.envelopeXdr, 'base64'),
    resultXdr: xdr.TransactionResult.fromXDR(raw.resultXdr, 'base64'),
    resultMetaXdr: xdr.TransactionMeta.fromXDR(raw.resultMetaXdr, 'base64'),
    events: { contractEventsXdr: [events], transactionEventsXdr: [] },
  };
}
function page(
  transactions: rpc.Api.TransactionInfo[],
  cursor = 'after-page',
  oldestLedger = 10,
  latestLedger = 11,
): rpc.Api.GetTransactionsResponse {
  return {
    transactions,
    cursor,
    oldestLedger,
    latestLedger,
    oldestLedgerCloseTimestamp: 0,
    latestLedgerCloseTimestamp: 0,
  };
}
function run(targetLedger?: number) {
  return indexHistory(
    { config, store, rpc: { getTransactions }, budget, head: 11 },
    { jobId: 'test', startLedger: 10, targetLedger },
  );
}
function savedState() {
  return store.streams.get('backfill:test')?.state as HistoricalState | undefined;
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
  getTransactions.mockReset();
  getTransactions.mockResolvedValue(page([]));
});
describe('bounded historical indexing', () => {
  it('acknowledges completion only after forcing a final leaderboard refresh', async () => {
    const result = await run();
    expect(store.refreshModes).toEqual(['force']);
    expect(savedState()).toMatchObject({ done: true, leaderboardRefreshed: true });
    expect(result).toMatchObject({ done: true, lastLedger: 11 });
  });
  it('retries a failed final refresh without rescanning or replaying completed history', async () => {
    getTransactions.mockImplementation(async (query) =>
      query.pagination?.cursor ? page([]) : page([tx(1)]),
    );
    store.refreshFailure = new Error('refresh unavailable');
    await expect(run()).rejects.toThrow(/refresh unavailable/);
    expect(savedState()).toMatchObject({ done: true, lastLedger: 11 });
    expect(savedState()?.leaderboardRefreshed).not.toBe(true);
    const reads = getTransactions.mock.calls.length;
    store.refreshFailure = undefined;
    expect(await run()).toMatchObject({ done: true, processed: 0 });
    expect(store.events).toHaveLength(1);
    expect(getTransactions).toHaveBeenCalledTimes(reads);
    expect(store.refreshModes).toEqual(['force', 'force']);
  });
  it('resumes the final refresh when the scan uses up its time budget', async () => {
    store.afterCommit = () => {
      if (savedState()?.done) stopped = true;
    };
    expect(await run()).toMatchObject({ done: false, timedOut: true });
    expect(store.refreshModes).toEqual([]);
    stopped = false;
    store.afterCommit = undefined;
    getTransactions.mockRejectedValue(new Error('source history has since expired'));
    expect(await run()).toMatchObject({ done: true, processed: 0 });
    expect(store.refreshModes).toEqual(['force']);
    expect(getTransactions).toHaveBeenCalledTimes(1);
  });
  it('does not acknowledge a refresh returned after cancellation', async () => {
    store.afterRefresh = () => {
      stopped = true;
    };
    expect(await run()).toMatchObject({ done: false, timedOut: true });
    expect(savedState()?.leaderboardRefreshed).not.toBe(true);
    stopped = false;
    store.afterRefresh = undefined;
    expect(await run()).toMatchObject({ done: true });
    expect(store.refreshModes).toEqual(['force', 'force']);
  });
  it('keeps finalization pending if its acknowledgement write fails', async () => {
    store.afterRefresh = () => {
      store.failure = new Error('lease lost');
    };
    await expect(run()).rejects.toThrow(/lease lost/);
    expect(savedState()?.leaderboardRefreshed).not.toBe(true);
    store.failure = null;
    store.afterRefresh = undefined;
    expect(await run()).toMatchObject({ done: true, processed: 0 });
    expect(store.refreshModes).toEqual(['force', 'force']);
  });
  it('reloads an acknowledged final refresh after losing its commit response', async () => {
    store.afterCommit = () => {
      if (savedState()?.leaderboardRefreshed) throw new Error('response lost');
    };
    await expect(run()).rejects.toThrow(/response lost/);
    expect(savedState()?.leaderboardRefreshed).toBe(true);
    store.afterCommit = undefined;
    const reads = getTransactions.mock.calls.length;
    expect(await run()).toMatchObject({ done: true, processed: 0 });
    expect(getTransactions).toHaveBeenCalledTimes(reads);
    expect(store.refreshModes).toEqual(['force']);
  });
  it('resumes a single transaction larger than one invocation without renumbering or duplicate writes', async () => {
    const large = tx(450);
    getTransactions.mockImplementation(async (q) =>
      q.pagination?.cursor ? page([]) : page([large]),
    );
    store.afterCommit = () => {
      stopped = true;
    };
    expect((await run()).done).toBe(false);
    expect(store.events).toHaveLength(200);
    expect(store.streams.get('backfill:test')?.state).toMatchObject({
      pending: { eventOffset: 200 },
    });
    stopped = false;
    expect((await run()).done).toBe(false);
    expect(store.events).toHaveLength(400);
    stopped = false;
    store.afterCommit = undefined;
    expect((await run()).done).toBe(true);
    expect(store.events).toHaveLength(450);
    expect(new Set(store.events.map((e) => e.id)).size).toBe(450);
  });
  it('resumes inside a later transaction of a later page within the same ledger', async () => {
    const first = [tx(1, 10, 1)],
      second = [tx(50, 10, 2), tx(250, 10, 3)];
    getTransactions.mockImplementation(async (q) => {
      if (!q.pagination?.cursor) return page(first, 'page-one');
      if (q.pagination.cursor === 'page-one') return page(second, 'page-two');
      return page([], 'end');
    });
    let commits = 0;
    store.afterCommit = () => {
      if (++commits === 2) stopped = true;
    };
    expect((await run()).done).toBe(false);
    expect(store.streams.get('backfill:test')?.state).toMatchObject({
      lastLedger: 9,
      cursor: 'page-one',
      pending: { transactionIndex: 1, eventOffset: 150 },
    });
    stopped = false;
    store.afterCommit = undefined;
    expect((await run()).done).toBe(true);
    expect(store.events).toHaveLength(301);
    expect(new Set(store.events.map((e) => e.id)).size).toBe(301);
  });
  it('saves progress for eventless transaction pages and stops at the fixed target', async () => {
    getTransactions.mockResolvedValueOnce(page([tx(0), tx(1, 12)]));
    const result = await run(11);
    expect(result.done).toBe(true);
    expect(store.events).toEqual([]);
    expect(store.streams.get('backfill:test')?.state).toMatchObject({
      lastLedger: 11,
      targetLedger: 11,
    });
  });
  it('rejects expired provider history without clamping an exact historical range', async () => {
    getTransactions.mockResolvedValue(page([], 'end', 11));
    await expect(run()).rejects.toThrow(/retention/i);
    expect(store.streams.size).toBe(0);
  });
  it('retains progress on missing prerequisites or any other failed batch', async () => {
    getTransactions.mockResolvedValue(page([tx(1)]));
    store.failure = new Error('missing prerequisite');
    await expect(run()).rejects.toThrow(/missing prerequisite/);
    expect(store.streams.size).toBe(0);
  });
  it('rejects a changed target on a persisted job', async () => {
    getTransactions.mockResolvedValue(page([tx(250)]));
    store.afterCommit = () => {
      stopped = true;
    };
    await run(11);
    stopped = false;
    await expect(run(10)).rejects.toThrow(/target/i);
  });
  it('rejects changed page contents when resuming an intra-transaction offset', async () => {
    getTransactions.mockResolvedValue(page([tx(250)]));
    store.afterCommit = () => {
      stopped = true;
    };
    await run();
    stopped = false;
    getTransactions.mockResolvedValue(page([tx(250, 10, 2)]));
    await expect(run()).rejects.toThrow(/resume/i);
    expect(store.events).toHaveLength(200);
  });
  it('does not acknowledge malformed recognized input later in the transaction', async () => {
    const malformed = tx(250);
    const event = malformed.events.contractEventsXdr[0][249];
    malformed.events.contractEventsXdr[0][249] = new xdr.ContractEvent({
      ...event,
      body: xdr.ContractEventBody.v0(new xdr.ContractEventV0({
        ...event.body.v0, data: nativeToScVal({}),
      })),
    });
    getTransactions.mockResolvedValue(page([malformed]));
    await expect(run()).rejects.toThrow(/Invalid event/);
    expect(store.events).toEqual([]);
  });
  it('does not checkpoint a historical validation request with a missing URI field', async () => {
    const malformed = tx(1);
    const event = malformed.events.contractEventsXdr[0][0];
    malformed.events.contractEventsXdr[0][0] = new xdr.ContractEvent({
      ...event,
      contractId: new xdr.ContractId(StrKey.decodeContract(config.contracts.validation)),
      body: xdr.ContractEventBody.v0(new xdr.ContractEventV0({
        topics: [
        nativeToScVal('validation_request', { type: 'symbol' }),
        nativeToScVal('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', {
          type: 'address',
        }),
        nativeToScVal(1, { type: 'u32' }),
        nativeToScVal(new Uint8Array(32)),
        ],
        data: nativeToScVal({}),
      })),
    });
    getTransactions.mockImplementation(async (query) =>
      query.pagination?.cursor ? page([]) : page([malformed]),
    );
    await expect(run()).rejects.toThrow(/Invalid event/);
    expect(store.events).toEqual([]);
    expect(store.streams.size).toBe(0);
  });
  it('does not write a response returned after cancellation', async () => {
    getTransactions.mockImplementation(async () => {
      stopped = true;
      return page([tx(1)]);
    });
    expect((await run()).timedOut).toBe(true);
    expect(store.streams.size).toBe(0);
  });
  it('refuses a source page with no cursor advancement', async () => {
    getTransactions.mockResolvedValue(page([tx(1)], ''));
    await expect(run()).rejects.toThrow(/cursor/);
    expect(store.events).toEqual([]);
  });
});
