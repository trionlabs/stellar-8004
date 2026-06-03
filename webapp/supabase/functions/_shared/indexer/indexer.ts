// AUTO-GENERATED from packages/indexer/src/indexer.ts — DO NOT EDIT.
// Regenerate with: pnpm --filter @stellar8004/indexer sync:shared

import * as StellarSdk from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getConfig } from './config.ts';
import {
  bulkUpsertMetadataSet,
  bulkUpsertNewFeedback,
  bulkUpsertRegistered,
  bulkUpsertValidationRequest,
  createSupabaseAdmin,
  getCheckpointState,
  isRetryableWriteError,
  refreshLeaderboard,
  updateCheckpoint,
  writeIdentityEvent,
  writeReputationEvent,
  writeValidationEvent,
} from './db.ts';
import { log } from './logger.ts';
import { parseIdentityEvent } from './parsers/identity.ts';
import { parseReputationEvent } from './parsers/reputation.ts';
import { parseValidationEvent } from './parsers/validation.ts';
import { withRetry } from './retry.ts';

/**
 * Runtime handler for a single contract. `process` parses one raw RPC event
 * and persists it, returning the event's discriminant `type` for counting (or
 * `null` when the event was unparseable and skipped). The parser→writer type
 * linkage is bound inside {@link defineContract}, so a handler whose writer
 * does not accept its parser's output fails to compile.
 */
interface ContractHandler {
  name: string;
  contractId: string;
  affectsLeaderboard: boolean;
  /** Parse one raw event (no write); `null` when unparseable/skipped. */
  parse: (event: rpc.Api.EventResponse) => { type: string } | null;
  /** Persist one already-parsed event via its bound writer. */
  writeOne: (db: SupabaseClient, parsed: { type: string }) => Promise<void>;
  /** Event types this handler can bulk-upsert in a single round-trip. */
  bulkTypes: ReadonlySet<string>;
  /** Bulk-write a page of same-typed events. Throws if `type` is unsupported. */
  bulkWrite: (
    db: SupabaseClient,
    type: string,
    events: { type: string }[],
  ) => Promise<void>;
}

/**
 * Binds a contract's parser output type `E` to its writer input type at the
 * definition site. Erases `E` from the returned {@link ContractHandler} so the
 * indexer loop can iterate a heterogeneous registry without the correlated-union
 * problem — while still rejecting a mismatched parser/writer pair at compile time.
 */
function defineContract<E extends { type: string }>(cfg: {
  name: string;
  contractId: string;
  affectsLeaderboard: boolean;
  parser: (event: rpc.Api.EventResponse) => E | null;
  writer: (db: SupabaseClient, event: E) => Promise<void>;
  /**
   * Optional per-type bulk writers. A type present here is eligible for the
   * homogeneous-page fast path; absent types always take the per-event writer.
   */
  bulkWriters?: Partial<Record<E['type'], (db: SupabaseClient, events: E[]) => Promise<void>>>;
}): ContractHandler {
  const bulkWriters = (cfg.bulkWriters ?? {}) as Record<
    string,
    (db: SupabaseClient, events: E[]) => Promise<void>
  >;
  return {
    name: cfg.name,
    contractId: cfg.contractId,
    affectsLeaderboard: cfg.affectsLeaderboard,
    parse: cfg.parser as (event: rpc.Api.EventResponse) => { type: string } | null,
    writeOne: cfg.writer as (db: SupabaseClient, parsed: { type: string }) => Promise<void>,
    bulkTypes: new Set(Object.keys(bulkWriters)),
    async bulkWrite(db, type, events) {
      const fn = bulkWriters[type];
      if (fn == null) {
        throw new Error(`[${cfg.name}] no bulk writer registered for ${type}`);
      }
      await fn(db, events as E[]);
    },
  };
}

interface ContractIndexerResult {
  processed: number;
  errors: number;
  /** Events dropped by the escape hatch after exceeding MAX_DEFER_ATTEMPTS. */
  skipped: number;
  lastLedger: number;
  events: Record<string, number>;
}

const GAP_THRESHOLD = 100;

// Per-page event cap. Soroban RPC defaults to 100 and allows up to 10000;
// requesting the max cuts pagination round-trips ~100x on busy contracts and
// cold-start catch-up with no change in correctness (cursor pagination still
// walks the full window).
const EVENTS_PAGE_LIMIT = 10000;

// After this many consecutive runs deferring a contract's batch on a retryable
// (foreign-key) write failure, give up deferring and skip the offending event
// so a permanently-unresolvable parent (e.g. a dropped/unparseable Registered)
// cannot wedge the stream forever. The skip is logged at error level.
const MAX_DEFER_ATTEMPTS = 5;

export interface IndexerResult {
  processed: number;
  errors: number;
  /** Total events dropped by the escape hatch across all contracts. */
  skippedEvents: number;
  contracts: Record<string, ContractIndexerResult & { expectedNextLedger?: number }>;
  /** True when another instance held the lock and this run did nothing. */
  skipped?: boolean;
  /** True when the run stopped early because it hit its soft time budget. */
  timedOut?: boolean;
  gaps: Array<{ contract: string; expectedLedger: number; actualLedger: number; gapSize: number }>;
}

export interface RunIndexerOptions {
  /**
   * Absolute epoch-ms deadline. When reached, the loop stops cleanly between
   * pages/contracts (leaving un-scanned contracts for the next run) so the
   * lock is released before the edge function's hard timeout kills the isolate.
   */
  deadlineMs?: number;
}

function assertIndexerConfig(config: ReturnType<typeof getConfig>): void {
  if (!config.rpcUrl) {
    throw new Error('Missing RPC URL in indexer configuration');
  }

  for (const [name, contractId] of Object.entries(config.contracts)) {
    if (!contractId) {
      throw new Error(`Missing contract ID for ${name}`);
    }
  }
}

export async function runIndexer(options: RunIndexerOptions = {}): Promise<IndexerResult> {
  const config = getConfig();
  assertIndexerConfig(config);

  const rpcServer = new StellarSdk.rpc.Server(config.rpcUrl, {
    allowHttp: config.rpcUrl.startsWith('http://'),
  });
  const db = createSupabaseAdmin();

  // Concurrent run guard (table-based lock, pgBouncer-safe). The owner token
  // fences the release: a run whose lock was reaped as stale cannot delete a
  // successor's freshly-acquired lock when it eventually finishes.
  const lockOwner = crypto.randomUUID();
  const lockResult = await db.rpc('acquire_indexer_lock', { p_owner: lockOwner });
  if (!lockResult.data) {
    log({ level: 'warn', msg: 'Another instance is running, skipping' });
    return { processed: 0, errors: 0, skippedEvents: 0, contracts: {}, skipped: true, gaps: [] };
  }

  try {
    return await runIndexerLoop(rpcServer, db, config, options);
  } finally {
    // Never let a release blip mask the run's outcome: the indexing work is
    // already committed, and a lock left behind is reaped by acquire's 180s
    // stale-sweep. Throwing here would turn a successful run into a 500.
    try {
      await db.rpc('release_indexer_lock', { p_owner: lockOwner });
    } catch (error) {
      log({
        level: 'error',
        msg: 'Failed to release indexer lock (will be reaped as stale)',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function runIndexerLoop(
  rpcServer: StellarSdk.rpc.Server,
  db: SupabaseClient,
  config: ReturnType<typeof getConfig>,
  options: RunIndexerOptions,
): Promise<IndexerResult> {
  const deadlineMs = options.deadlineMs;
  const deadlineReached = (): boolean => deadlineMs != null && Date.now() >= deadlineMs;

  // Probed once per run (the first time any contract has work) to clamp a start
  // ledger that has aged out of the RPC retention window. Without the clamp,
  // getEvents(startLedger < oldestLedger) errors with "start is before oldest
  // ledger", the scan aborts, the checkpoint never advances, and the contract
  // makes zero forward progress on every subsequent run — a permanent wedge.
  let cachedOldestLedger: number | null = null;

  // Identity is processed first so that an agent's `Registered` row exists
  // before any feedback/validation row that references it via foreign key.
  const contracts: ContractHandler[] = [
    defineContract({
      name: 'identity',
      contractId: config.contracts.identity,
      affectsLeaderboard: false,
      parser: parseIdentityEvent,
      writer: writeIdentityEvent,
      // Registered / MetadataSet are pure upserts; the RMW types (UriUpdated,
      // AgentWalletSet/Unset, AgentTransferred) stay on the per-event path.
      bulkWriters: {
        Registered: bulkUpsertRegistered,
        MetadataSet: bulkUpsertMetadataSet,
      },
    }),
    defineContract({
      name: 'reputation',
      contractId: config.contracts.reputation,
      affectsLeaderboard: true,
      parser: parseReputationEvent,
      writer: writeReputationEvent,
      // FeedbackRevoked (update) / ResponseAppended (rpc) stay per-event.
      bulkWriters: {
        NewFeedback: bulkUpsertNewFeedback,
      },
    }),
    defineContract({
      name: 'validation',
      contractId: config.contracts.validation,
      affectsLeaderboard: true,
      parser: parseValidationEvent,
      writer: writeValidationEvent,
      // ValidationResponse (update) stays per-event.
      bulkWriters: {
        ValidationRequest: bulkUpsertValidationRequest,
      },
    }),
  ];

  const result: IndexerResult = {
    processed: 0,
    errors: 0,
    skippedEvents: 0,
    contracts: {},
    gaps: [],
  };
  let needsLeaderboardRefresh = false;
  // Wrapped in withRetry like the other RPC calls: a single transient failure
  // here would otherwise throw out of the loop and strand the whole run
  // (all contracts), skipping the entire cron cycle.
  const { sequence: latestLedger } = await withRetry(() => rpcServer.getLatestLedger(), {
    maxAttempts: 3,
    baseDelayMs: 1000,
  });

  // Probe the oldest retained ledger via a head-anchored getEvents (always
  // in range), memoized for the run. Used to clamp cold-start scans.
  const getOldestLedger = async (contractId: string): Promise<number> => {
    if (cachedOldestLedger != null) return cachedOldestLedger;
    const probe = await withRetry(
      () =>
        rpcServer.getEvents({
          startLedger: latestLedger,
          filters: [{ type: 'contract', contractIds: [contractId] }],
          limit: 1,
        }),
      { maxAttempts: 3, baseDelayMs: 1000 },
    );
    cachedOldestLedger = probe.oldestLedger;
    return cachedOldestLedger;
  };

  for (const contract of contracts) {
    if (deadlineReached()) {
      result.timedOut = true;
      log({ level: 'warn', msg: 'Soft time budget reached, deferring remaining contracts', contract: contract.name });
      break;
    }

    const contractResult: ContractIndexerResult = {
      processed: 0,
      errors: 0,
      skipped: 0,
      lastLedger: 0,
      events: {},
    };

    const { lastLedger, expectedNext, deferAttempts } = await getCheckpointState(db, contract.name);
    // Once we have deferred this batch too many times, the failure is almost
    // certainly not transient. Switch to skip mode so the checkpoint can move
    // past the offending event instead of stalling the stream indefinitely.
    const skipRetryableErrors = deferAttempts >= MAX_DEFER_ATTEMPTS;

    if (lastLedger >= latestLedger) {
      contractResult.lastLedger = lastLedger;
      result.contracts[contract.name] = { ...contractResult, expectedNextLedger: expectedNext ?? undefined };
      continue;
    }

    let startLedger = lastLedger === 0 ? config.deployLedger : lastLedger + 1;

    // The start ledger may predate the RPC retention window in two cases:
    //   - cold start: the deploy ledger is weeks old, far past retention;
    //   - resume after downtime: the indexer was stopped longer than the
    //     retention window, so the saved checkpoint (lastLedger) has aged out.
    // In BOTH cases getEvents(startLedger < oldestLedger) hard-fails and the
    // checkpoint never advances, wedging the contract forever. Probe the oldest
    // retained ledger and clamp forward unconditionally — we deliberately do
    // NOT assume retention is long enough to make the resume case impossible.
    // The skipped range is recoverable only via the backfill script; the gap
    // detector below logs the jump so the skip is observable.
    // A transient RPC failure on the probe must NOT abort the whole run — that
    // would also strand the other contracts, including ones fully in-window
    // that need no clamp at all. On probe failure, skip the clamp for this
    // contract and proceed with the un-clamped start: if it really has aged out
    // of retention, the getEvents below fails in the per-contract catch and
    // only this contract defers to the next run, while the others still
    // advance. A failed probe is not memoized, so the next contract re-attempts
    // it (giving a flaky RPC another chance to answer).
    let oldestRetained: number | null = null;
    try {
      oldestRetained = await getOldestLedger(contract.contractId);
    } catch (error) {
      log({
        level: 'warn',
        msg: 'Oldest-ledger probe failed - skipping retention clamp for this contract',
        contract: contract.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (oldestRetained != null && oldestRetained > startLedger) {
      log({
        level: 'warn',
        msg: 'Start ledger predates RPC retention - clamping to oldest retained',
        contract: contract.name,
        requestedStartLedger: startLedger,
        oldestLedger: oldestRetained,
        coldStart: lastLedger === 0,
      });
      startLedger = oldestRetained;
    }

    if (expectedNext != null && startLedger > expectedNext + GAP_THRESHOLD) {
      const gapSize = startLedger - expectedNext;
      log({
        level: 'error',
        msg: 'LEDGER GAP DETECTED',
        contract: contract.name,
        expectedLedger: expectedNext,
        actualLedger: startLedger,
        gapSize,
      });
      result.gaps.push({
        contract: contract.name,
        expectedLedger: expectedNext,
        actualLedger: startLedger,
        gapSize,
      });
    }

    let cursor: string | undefined;
    let maxLedger = startLedger;
    let scanCompleted = true;
    // Set when THIS contract's scan stops because it hit the soft deadline (as
    // opposed to a retryable defer). Drives the defer-counter decision below
    // without depending on the run-global `result.timedOut`, which a future
    // refactor could clear or reorder.
    let deadlineStopped = false;
    // Set when a write fails in a way that should defer the WHOLE batch and
    // leave the checkpoint un-advanced so it is retried next run. Two cases:
    //   - retryable (FK) failure: a referenced parent row (e.g. an agent that
    //     identity has not indexed yet this run) does not exist; the
    //     prerequisite contract catches up by the next run.
    //   - transient non-retryable failure the PG-code classifier can't see
    //     (network reset, 5xx, too_many_connections): deferring instead of
    //     advancing prevents silently dropping the event.
    // Writes are idempotent upserts, so re-processing is safe.
    let retryableWriteFailure = false;

    log({
      level: 'info',
      msg: 'Indexing contract',
      contract: contract.name,
      startLedger,
      latestLedger,
    });

    while (true) {
      if (deadlineReached()) {
        // Stop cleanly mid-scan; leave the checkpoint un-advanced so the next
        // run resumes from here. Treated like a partial scan.
        scanCompleted = false;
        deadlineStopped = true;
        result.timedOut = true;
        log({ level: 'warn', msg: 'Soft time budget reached mid-scan', contract: contract.name });
        break;
      }

      const request: rpc.Api.GetEventsRequest = cursor
        ? {
            filters: [{ type: 'contract', contractIds: [contract.contractId] }],
            cursor,
            limit: EVENTS_PAGE_LIMIT,
          }
        : {
            filters: [{ type: 'contract', contractIds: [contract.contractId] }],
            startLedger,
            limit: EVENTS_PAGE_LIMIT,
          };

      let response: rpc.Api.GetEventsResponse;

      try {
        response = await withRetry(() => rpcServer.getEvents(request), {
          maxAttempts: 3,
          baseDelayMs: 1000,
        });
      } catch (error) {
        scanCompleted = false;
        log({
          level: 'error',
          msg: 'RPC getEvents error',
          contract: contract.name,
          error: error instanceof Error ? error.message : String(error),
        });
        contractResult.errors++;
        break;
      }

      // Fast path: a page whose events ALL parse to the same bulk-upsertable
      // type collapses into one multi-row upsert (the dominant backfill shape:
      // long runs of NewFeedback / ValidationRequest / Registered) — one
      // round-trip instead of one-per-event. On ANY failure we fall through to
      // the per-event loop, which keeps the FK-defer / skip-after-N handling and
      // re-applies safely (all writes are idempotent upserts; a failed PostgREST
      // statement rolls back wholesale, so nothing partial leaks through).
      // maxLedger only advances on a successful bulk write, so a deferred page
      // is never checkpoint-skipped.
      // Parse the page once; the result feeds BOTH the fast path and the
      // per-event fallback, so a parser is never invoked twice for an event.
      const parsedPage = response.events.map((ev) => contract.parse(ev));

      let bulkHandled = false;
      if (response.events.length > 1) {
        const firstType = parsedPage[0]?.type ?? null;
        const homogeneousBulk =
          firstType != null &&
          contract.bulkTypes.has(firstType) &&
          parsedPage.every((p) => p != null && p.type === firstType);

        if (homogeneousBulk) {
          try {
            await contract.bulkWrite(db, firstType, parsedPage as { type: string }[]);
            contractResult.processed += parsedPage.length;
            contractResult.events[firstType] =
              (contractResult.events[firstType] ?? 0) + parsedPage.length;
            if (contract.affectsLeaderboard) {
              needsLeaderboardRefresh = true;
            }
            for (const ev of response.events) {
              if (ev.ledger > maxLedger) maxLedger = ev.ledger;
            }
            bulkHandled = true;
          } catch (error) {
            log({
              level: 'warn',
              msg: 'Bulk page upsert failed - falling back to per-event',
              contract: contract.name,
              events: response.events.length,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      if (!bulkHandled)
        for (let i = 0; i < response.events.length; i++) {
          const event = response.events[i];
          const parsed = parsedPage[i];
        try {
          // Writer runs for any non-null parse (mirrors the old process()).
          if (parsed != null) {
            await contract.writeOne(db, parsed);
          }
          const eventType = parsed?.type ?? null;

          if (eventType != null) {
            contractResult.processed++;
            contractResult.events[eventType] = (contractResult.events[eventType] ?? 0) + 1;

            if (contract.affectsLeaderboard) {
              needsLeaderboardRefresh = true;
            }
          } else {
            log({
              level: 'warn',
              msg: 'Skipped unparseable event',
              contract: contract.name,
              eventId: event.id,
              ledger: event.ledger,
              topicCount: event.topic?.length ?? 0,
            });
          }
        } catch (error) {
          contractResult.errors++;

          if (isRetryableWriteError(error)) {
            if (skipRetryableErrors) {
              // Escape hatch: we have deferred this batch MAX_DEFER_ATTEMPTS
              // times, so treat the failure as permanent and skip the event
              // (the checkpoint will advance past it). Logged at error level so
              // monitoring can surface the dropped event.
              contractResult.skipped++;
              log({
                level: 'error',
                msg: 'Retryable write failure exceeded max defer attempts - skipping event',
                contract: contract.name,
                eventId: event.id,
                deferAttempts,
                error: error instanceof Error ? error.message : String(error),
              });
            } else {
              // A referenced parent row is not present yet (e.g. feedback for
              // an agent identity has not indexed). Abandon this batch without
              // advancing the checkpoint so it is retried on the next run.
              log({
                level: 'warn',
                msg: 'Retryable write failure - deferring batch to next run',
                contract: contract.name,
                eventId: event.id,
                deferAttempts,
                error: error instanceof Error ? error.message : String(error),
              });
              retryableWriteFailure = true;
              break;
            }
          } else {
            // Non-retryable per the PG-code classifier, but this branch also
            // catches TRANSIENT infrastructure failures the classifier cannot
            // see: postgrest-js sets code='' on client-side network errors, a
            // 5xx with a non-JSON body carries no code, and some genuinely
            // transient PG codes are absent from RETRYABLE_PG_CODES. Advancing
            // the checkpoint past such a failure would SILENTLY and PERMANENTLY
            // drop an on-chain event. Defer the batch (leave the checkpoint
            // un-advanced) so the event is retried next run; the
            // MAX_DEFER_ATTEMPTS escape hatch still skips a deterministically
            // poison event so it cannot wedge the stream forever.
            if (skipRetryableErrors) {
              contractResult.skipped++;
              log({
                level: 'error',
                msg: 'Write failure exceeded max defer attempts - skipping event',
                contract: contract.name,
                eventId: event.id,
                deferAttempts,
                error: error instanceof Error ? error.message : String(error),
              });
            } else {
              log({
                level: 'error',
                msg: 'Write failure - deferring batch to next run',
                contract: contract.name,
                eventId: event.id,
                deferAttempts,
                error: error instanceof Error ? error.message : String(error),
              });
              retryableWriteFailure = true;
              break;
            }
          }
        }

        if (event.ledger > maxLedger) {
          maxLedger = event.ledger;
        } else if (event.ledger < maxLedger) {
          // RPC pagination is supposed to be monotonic on ledger. If we
          // ever see an out-of-order event, log it loudly so the cursor
          // checkpoint we write at the end of the batch can be reasoned
          // about - we still process the event, but we don't let it pull
          // maxLedger backwards.
          log({
            level: 'warn',
            msg: 'Non-monotonic event ledger from RPC',
            contract: contract.name,
            eventId: event.id,
            eventLedger: event.ledger,
            maxLedger,
          });
        }
      }

      if (retryableWriteFailure) {
        // Leave the checkpoint where it was so the deferred events are retried.
        scanCompleted = false;
        break;
      }

      if (response.events.length > 0 && response.cursor) {
        cursor = response.cursor;
        continue;
      }

      break;
    }

    contractResult.lastLedger = scanCompleted
      ? Math.max(maxLedger, latestLedger)
      : lastLedger;
    const nextExpected = scanCompleted
      ? latestLedger + 1
      : expectedNext ?? undefined;
    // Reset the defer counter on a completed scan; increment it when we leave
    // the checkpoint un-advanced because of a retryable write failure. A
    // deadline-triggered stop is a clean partial scan, not a defer, so it
    // preserves the counter unchanged.
    const nextDeferAttempts = scanCompleted
      ? 0
      : deadlineStopped
        ? deferAttempts
        : deferAttempts + 1;
    await updateCheckpoint(
      db,
      contract.name,
      contractResult.lastLedger,
      nextExpected,
      nextDeferAttempts,
    );

    log({
      level: 'info',
      msg: 'Contract indexing complete',
      contract: contract.name,
      processed: contractResult.processed,
      errors: contractResult.errors,
      skipped: contractResult.skipped,
      lastLedger: contractResult.lastLedger,
      events: contractResult.events,
    });

    result.processed += contractResult.processed;
    result.errors += contractResult.errors;
    result.skippedEvents += contractResult.skipped;
    result.contracts[contract.name] = { ...contractResult, expectedNextLedger: nextExpected };
  }

  if (needsLeaderboardRefresh) {
    try {
      await refreshLeaderboard(db);
    } catch (error) {
      log({
        level: 'error',
        msg: 'Leaderboard refresh error',
        error: error instanceof Error ? error.message : String(error),
      });
      result.errors++;
    }
  }

  return result;
}
