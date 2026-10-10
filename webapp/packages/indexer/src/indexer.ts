import type { rpc } from '@stellar/stellar-sdk';
import { getConfig, type NetworkConfig } from './config.js';
import { IndexerWriteError, sourceIdentity, type ProjectionStore, type Stream } from './db.js';
import { CONTRACT_NAMES, prepareEvents, type ContractName, type EventPacket } from './events.js';
import { eventsFromTransaction } from './historical-source.js';
import { log } from './logger.js';
import { BudgetExceeded, withIndexerLease, type RunOptions, type WorkBudget } from './runtime.js';

export interface LiveState {
  lastLedger: number;
  startLedger: number;
  targetLedger: number;
  resumeLedger: number;
  cursor: string | null;
  deferAttempts: number;
}
interface ContractResult {
  processed: number;
  errors: number;
  skipped: number;
  lastLedger: number;
  events: Record<string, number>;
  expectedNextLedger?: number;
}
export interface IndexerResult {
  processed: number;
  errors: number;
  skippedEvents: number;
  contracts: Record<string, ContractResult>;
  skipped?: boolean;
  timedOut?: boolean;
  gaps: Array<{ contract: string; expectedLedger: number; actualLedger: number; gapSize: number }>;
}
export type RunIndexerOptions = RunOptions;
const emptyResult = (): IndexerResult => ({
  processed: 0,
  errors: 0,
  skippedEvents: 0,
  contracts: {},
  gaps: [],
});
const PAGE_SIZE = 100;
// RPC getEvents scans at most 10,000 ledgers even when endLedger is farther
// away. An empty page proves coverage only within this bounded window.
const LEDGER_WINDOW = 10_000;
type LiveRpc = Pick<rpc.Server, 'getEvents' | 'getTransaction'>;
interface LiveContext {
  rpc: LiveRpc;
  store: ProjectionStore;
  budget: WorkBudget;
  head: number;
  config: NetworkConfig;
}

export async function runIndexer(options: RunIndexerOptions = {}): Promise<IndexerResult> {
  const config = getConfig();
  const result = await withIndexerLease(config, 'live', options, async (context) => {
    const result = await indexLive({ ...context, config });
    if (result.processed && !context.budget.expired()) {
      try {
        await context.store.refreshLeaderboard();
      } catch (error) {
        log({ level: 'error', msg: 'Leaderboard refresh failed', error: String(error) });
      }
    }
    return result;
  });
  return result ?? { ...emptyResult(), skipped: true };
}

function validatePage(
  events: readonly rpc.Api.EventResponse[],
  cursor: string | null,
  start: number,
): void {
  let previous = cursor;
  let ledger = start;
  for (const event of events) {
    if (
      !/^\d{19}-\d{10}$/.test(event.id) ||
      (previous != null && event.id <= previous) ||
      event.ledger < ledger
    ) {
      throw new Error('RPC event page is out of order or did not advance');
    }
    previous = event.id;
    ledger = event.ledger;
  }
}

/** A registration's initialization events precede Registered, sometimes across
 * a page boundary. Fetch its own transaction to materialize only the verified
 * parent. Its source page remains unacknowledged until every claim succeeds.
 * Parent commits make these lookups resumable even if a run ends between them. */
async function ensureRegistrations(
  context: LiveContext,
  stream: Stream<LiveState>,
  state: LiveState,
  packets: readonly EventPacket[],
): Promise<Stream<LiveState>> {
  const inPage = new Set(
    packets.filter((p) => p.data.type === 'Registered').map((p) => p.data.agentId),
  );
  const needed = packets.filter((p) => p.contract === 'identity' && !inPage.has(p.data.agentId));
  context.budget.check();
  const missing = new Set(await context.store.missingAgents(needed.map((p) => p.data.agentId)));
  const hashes = new Set(
    needed.filter((p) => missing.has(p.data.agentId)).map((p) => p.data.txHash),
  );
  for (const hash of hashes) {
    context.budget.check();
    const tx = await context.rpc.getTransaction(hash);
    context.budget.check();
    if (tx.status !== 'SUCCESS' || tx.txHash !== hash)
      throw new Error(`Registration transaction unavailable: ${hash}`);
    const candidates = needed.filter((p) => p.data.txHash === hash && missing.has(p.data.agentId));
    const parents = prepareEvents(
      eventsFromTransaction(tx, new Set([context.config.contracts.identity])),
      context.config,
    ).filter(
      (p) =>
        p.data.type === 'Registered' &&
        candidates.some(
          (c) =>
            c.data.agentId === p.data.agentId &&
            c.data.ledger === p.data.ledger &&
            BigInt(c.id.slice(0, 19)) >> 12n === BigInt(p.id.slice(0, 19)) >> 12n,
        ),
    );
    if (parents.length !== new Set(candidates.map((p) => p.data.agentId)).size)
      throw new Error('Missing prerequisite registration; restore earlier history');
    stream = (await context.store.commit(stream, parents, state)).stream;
  }
  return stream;
}

/** One page per contract each round; the least recently serviced stream starts
 * the next invocation, so a busy ledger cannot monopolize every time budget. */
export async function indexLive(context: LiveContext): Promise<IndexerResult> {
  const { store, config, budget, head } = context;
  const result = emptyResult();
  const source = sourceIdentity(config);
  const streams = new Map<ContractName, Stream<LiveState>>();
  const states = new Map<ContractName, LiveState>();
  const blocked = new Set<ContractName>();
  for (const name of CONTRACT_NAMES) {
    result.contracts[name] = { processed: 0, errors: 0, skipped: 0, lastLedger: 0, events: {} };
    try {
      const stream = await store.read<LiveState>(`live:${name}`, source);
      const lastLedger = stream.state?.lastLedger ?? (await store.checkpoint(name));
      const start = lastLedger === 0 ? Math.max(1, config.deployLedger) : lastLedger + 1;
      const state: LiveState =
        stream.state && stream.state.targetLedger > lastLedger
          ? stream.state
          : {
              lastLedger,
              startLedger: start,
              targetLedger: Math.min(head, start + LEDGER_WINDOW - 1),
              resumeLedger: start,
              cursor: null,
              deferAttempts: 0,
            };
      if (
        !Number.isSafeInteger(lastLedger) ||
        lastLedger < 0 ||
        lastLedger > head ||
        state.targetLedger > head ||
        (lastLedger < head &&
          (state.targetLedger < state.startLedger ||
            state.targetLedger - state.startLedger >= LEDGER_WINDOW))
      )
        throw new Error('Saved live range is outside RPC history/head');
      streams.set(name, stream);
      states.set(name, state);
      result.contracts[name].lastLedger = lastLedger;
      if (lastLedger >= head) blocked.add(name);
    } catch (error) {
      fail(name, error);
    }
  }
  function fail(name: ContractName, error: unknown) {
    blocked.add(name);
    result.errors++;
    result.contracts[name].errors++;
    log({
      level: 'error',
      msg: 'Contract deferred without skipping events',
      contract: name,
      error: String(error),
    });
  }
  let oldest: number | undefined;
  const order = [...CONTRACT_NAMES].sort((a, b) =>
    (streams.get(a)?.updatedAt ?? '').localeCompare(streams.get(b)?.updatedAt ?? ''),
  );
  while (blocked.size < CONTRACT_NAMES.length) {
    for (const name of order) {
      if (blocked.has(name)) continue;
      if (budget.expired()) {
        result.timedOut = true;
        return result;
      }
      let stream = streams.get(name)!;
      let state = states.get(name)!;
      try {
        budget.check();
        if (oldest == null) {
          const probe = await context.rpc.getEvents({
            startLedger: head,
            filters: [{ type: 'contract', contractIds: [config.contracts[name]] }],
            limit: 1,
          });
          budget.check();
          if (
            !Number.isSafeInteger(probe.oldestLedger) ||
            probe.oldestLedger < 1 ||
            probe.oldestLedger > head
          )
            throw new Error('Invalid RPC retention boundary');
          oldest = probe.oldestLedger;
        }
        if (state.resumeLedger < oldest) {
          const gap = { contract: name, startLedger: state.resumeLedger, endLedger: oldest };
          const clamped = {
            ...state,
            lastLedger: oldest - 1,
            startLedger: oldest,
            resumeLedger: oldest,
            targetLedger: Math.min(head, oldest + LEDGER_WINDOW - 1),
            cursor: null,
          };
          stream = (await store.commit(stream, [], clamped, gap)).stream;
          state = clamped;
          streams.set(name, stream);
          states.set(name, state);
          result.contracts[name].lastLedger = state.lastLedger;
          result.gaps.push({
            contract: name,
            expectedLedger: gap.startLedger,
            actualLedger: oldest,
            gapSize: oldest - gap.startLedger,
          });
        }
        budget.check();
        const filters = [{ type: 'contract' as const, contractIds: [config.contracts[name]] }];
        const response = await context.rpc.getEvents(
          state.cursor
            ? { filters, cursor: state.cursor, limit: PAGE_SIZE }
            : {
                filters,
                startLedger: state.startLedger,
                endLedger: state.targetLedger + 1,
                limit: PAGE_SIZE,
              },
        );
        budget.check();
        if (
          !Number.isSafeInteger(response.oldestLedger) ||
          response.oldestLedger < 1 ||
          response.oldestLedger > state.resumeLedger
        )
          throw new Error('RPC retention changed during the scan; retry to record a gap');
        if (
          !Number.isSafeInteger(response.latestLedger) ||
          response.latestLedger < state.targetLedger
        )
          throw new Error('RPC response cannot certify the target ledger');
        if (response.events.length > PAGE_SIZE)
          throw new Error('RPC exceeded the requested page limit');
        validatePage(response.events, state.cursor, state.startLedger);
        if (
          response.events.some(
            (e) => e.type !== 'contract' || e.contractId?.contractId() !== config.contracts[name],
          )
        )
          throw new Error('RPC returned an event outside the requested contract');
        const events = response.events.filter((e) => e.ledger <= state.targetLedger);
        const packets = prepareEvents(events, config);
        stream = await ensureRegistrations(context, stream, state, packets);
        streams.set(name, stream);
        const complete = response.events.length === 0 || events.length < response.events.length;
        const last = events.at(-1);
        const next: LiveState = complete
          ? {
              ...state,
              lastLedger: state.targetLedger,
              cursor: null,
              startLedger: state.targetLedger + 1,
              resumeLedger: state.targetLedger + 1,
              deferAttempts: 0,
            }
          : { ...state, cursor: last!.id, resumeLedger: last!.ledger, deferAttempts: 0 };
        budget.check();
        const committed = await store.commit(stream, packets, next);
        streams.set(name, committed.stream);
        states.set(name, next);
        const summary = result.contracts[name];
        summary.lastLedger = next.lastLedger;
        summary.expectedNextLedger = next.lastLedger + 1;
        summary.processed += packets.length;
        result.processed += packets.length;
        for (const p of packets)
          summary.events[p.data.type] = (summary.events[p.data.type] ?? 0) + 1;
        if (complete) {
          if (next.lastLedger >= head) blocked.add(name);
          else
            states.set(name, {
              ...next,
              targetLedger: Math.min(head, next.startLedger + LEDGER_WINDOW - 1),
            });
        }
      } catch (error) {
        if (error instanceof BudgetExceeded || budget.expired()) {
          result.timedOut = true;
          return result;
        }
        if (error instanceof IndexerWriteError) {
          // Diagnostic only. A failed/unknown commit never authorizes skipping;
          // revision checking also rejects this if that unknown commit landed.
          try {
            await store.commit(stream, [], { ...state, deferAttempts: state.deferAttempts + 1 });
          } catch {
            /* Preserve the original failure and its acknowledged cursor. */
          }
        }
        fail(name, error);
      }
    }
  }
  return result;
}
