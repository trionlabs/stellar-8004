import type { rpc } from '@stellar/stellar-sdk';
import { getConfig, type NetworkConfig } from './config.js';
import { sourceIdentity, type ProjectionStore } from './db.js';
import { parentsFirst, prepareEvents, type EventPacket } from './events.js';
import { eventsFromTransaction } from './historical-source.js';
import { BudgetExceeded, withIndexerLease, type RunOptions, type WorkBudget } from './runtime.js';

export interface BackfillOptions extends RunOptions {
  jobId: string;
  startLedger: number;
  targetLedger?: number;
  config?: NetworkConfig;
}
interface TransactionPosition {
  ledger: number;
  order: number;
  hash: string;
}
export interface HistoricalState {
  startLedger: number;
  targetLedger: number;
  lastLedger: number;
  resumeLedger: number;
  cursor: string | null;
  /** Source scan completion, before the final leaderboard rebuild. */
  done: boolean;
  /** Absent on older jobs; only acknowledged after a forced rebuild succeeds. */
  leaderboardRefreshed?: boolean;
  after: TransactionPosition | null;
  pending: {
    firstHash: string;
    transactionHash: string;
    transactionIndex: number;
    eventOffset: number;
  } | null;
}
export interface BackfillResult {
  done: boolean;
  processed: number;
  lastLedger: number;
  targetLedger: number;
  timedOut?: boolean;
  skipped?: boolean;
}
interface HistoryContext {
  config: NetworkConfig;
  store: ProjectionStore;
  rpc: Pick<rpc.Server, 'getTransactions'>;
  budget: WorkBudget;
  head: number;
}
const TRANSACTION_PAGE_SIZE = 100;
const BATCH_SIZE = 200;

export async function runBackfill(options: BackfillOptions): Promise<BackfillResult> {
  const config = options.config ?? getConfig();
  const result = await withIndexerLease(config, 'backfill', options, (context) =>
    indexHistory({ ...context, config }, options),
  );
  return (
    result ?? {
      done: false,
      processed: 0,
      lastLedger: 0,
      targetLedger: options.targetLedger ?? 0,
      skipped: true,
    }
  );
}

/** Progress includes a page-local transaction and event offset. A large ledger
 * or transaction can span bounded invocations, without deriving new identities
 * from filtered indices or repeatedly writing an already acknowledged prefix. */
export async function indexHistory(
  context: HistoryContext,
  options: Pick<BackfillOptions, 'jobId' | 'startLedger' | 'targetLedger'>,
): Promise<BackfillResult> {
  const { config, store, rpc, budget, head } = context;
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(options.jobId)) throw new Error('Invalid backfill job ID');
  const start = options.startLedger;
  if (!Number.isSafeInteger(start) || start < 1)
    throw new Error('Backfill startLedger must be a positive integer');
  const source = `${sourceIdentity(config)};start=${start};page=${TRANSACTION_PAGE_SIZE}`;
  let stream = await store.read<HistoricalState>(`backfill:${options.jobId}`, source);
  let state: HistoricalState = stream.state ?? {
    startLedger: start,
    targetLedger: options.targetLedger ?? head,
    lastLedger: start - 1,
    resumeLedger: start,
    cursor: null,
    pending: null,
    after: null,
    done: false,
    leaderboardRefreshed: false,
  };
  if (
    !Number.isSafeInteger(state.targetLedger) ||
    state.targetLedger < start ||
    state.targetLedger > head ||
    (options.targetLedger != null && options.targetLedger !== state.targetLedger)
  )
    throw new Error('Backfill target mismatch or unavailable target ledger');
  let processed = 0;
  const result = (): BackfillResult => ({
    done: state.done && state.leaderboardRefreshed === true,
    processed,
    lastLedger: state.lastLedger,
    targetLedger: state.targetLedger,
  });
  const finish = async (): Promise<BackfillResult> => {
    if (state.leaderboardRefreshed !== true) {
      budget.check();
      // The scan is already durable. A failed/cancelled refresh or lost receipt
      // retries this idempotent rebuild without requiring source history again.
      await store.refreshLeaderboard('force');
      budget.check();
      const finalized = { ...state, leaderboardRefreshed: true };
      stream = (await store.commit(stream, [], finalized)).stream;
      state = finalized;
    }
    return result();
  };
  const contracts = new Set(Object.values(config.contracts));
  try {
    if (state.done) return await finish();
    while (!budget.expired()) {
      const response = await rpc.getTransactions(
        state.cursor
          ? { pagination: { cursor: state.cursor, limit: TRANSACTION_PAGE_SIZE } }
          : { startLedger: start, pagination: { limit: TRANSACTION_PAGE_SIZE } },
      );
      budget.check();
      if (
        !Number.isSafeInteger(response.oldestLedger) ||
        response.oldestLedger < 1 ||
        response.oldestLedger > state.resumeLedger
      )
        throw new Error('Historical RPC retention no longer covers the requested resume point');
      if (
        !Number.isSafeInteger(response.latestLedger) ||
        response.latestLedger < state.targetLedger
      )
        throw new Error('Historical RPC response cannot certify the target ledger');
      const txs = response.transactions;
      if (!Array.isArray(txs) || txs.length > TRANSACTION_PAGE_SIZE)
        throw new Error('Invalid historical transaction page');
      if (txs.length && (!response.cursor || response.cursor === state.cursor))
        throw new Error('Historical RPC cursor did not advance');
      let previous = state.after;
      for (const tx of txs) {
        if (
          !Number.isSafeInteger(tx.ledger) ||
          !Number.isSafeInteger(tx.applicationOrder) ||
          tx.applicationOrder < 1 ||
          tx.ledger < start ||
          (previous &&
            (tx.ledger < previous.ledger ||
              (tx.ledger === previous.ledger && tx.applicationOrder <= previous.order)))
        )
          throw new Error('Historical transaction page is out of order');
        previous = { ledger: tx.ledger, order: tx.applicationOrder, hash: tx.txHash };
      }
      const pending = state.pending;
      if (
        pending &&
        (txs[0]?.txHash !== pending.firstHash ||
          txs[pending.transactionIndex]?.txHash !== pending.transactionHash)
      )
        throw new Error('Historical resume page no longer matches the saved transaction');
      let batch: EventPacket[] = [];
      let next = { ...state };
      const flush = async () => {
        budget.check();
        const committed = await store.commit(stream, batch, next);
        stream = committed.stream;
        state = next;
        processed += batch.length;
        batch = [];
      };
      for (let i = pending?.transactionIndex ?? 0; i < txs.length; i++) {
        budget.check();
        const tx = txs[i];
        if (tx.ledger > state.targetLedger) {
          next = { ...next, lastLedger: state.targetLedger, done: true, pending: null };
          await flush();
          return await finish();
        }
        // Validate the whole transaction before persisting any of its chunks.
        const packets = parentsFirst(prepareEvents(eventsFromTransaction(tx, contracts), config));
        const offset = i === pending?.transactionIndex ? pending.eventOffset : 0;
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > packets.length)
          throw new Error('Invalid historical event resume offset');
        for (let j = offset; j < packets.length; j++) {
          batch.push(packets[j]);
          next = {
            ...next,
            lastLedger: Math.max(next.lastLedger, tx.ledger - 1),
            resumeLedger: txs[0].ledger,
            pending: {
              firstHash: txs[0].txHash,
              transactionHash: tx.txHash,
              transactionIndex: i,
              eventOffset: j + 1,
            },
          };
          if (batch.length === BATCH_SIZE) await flush();
        }
        next = { ...next, lastLedger: Math.max(next.lastLedger, tx.ledger - 1) };
      }
      if (txs.length === 0) {
        next = { ...next, done: true, lastLedger: state.targetLedger, pending: null };
      } else {
        const last = txs[txs.length - 1];
        next = {
          ...next,
          cursor: response.cursor,
          pending: null,
          resumeLedger: last.ledger,
          after: { ledger: last.ledger, order: last.applicationOrder, hash: last.txHash },
        };
      }
      await flush();
      if (state.done) return await finish();
    }
  } catch (error) {
    if (!(error instanceof BudgetExceeded) && !budget.expired()) throw error;
  }
  return { ...result(), timedOut: true };
}
