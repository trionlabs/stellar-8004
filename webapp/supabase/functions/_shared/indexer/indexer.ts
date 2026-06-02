// AUTO-GENERATED from packages/indexer/src/indexer.ts — DO NOT EDIT.
// Regenerate with: pnpm --filter @stellar8004/indexer sync:shared

import * as StellarSdk from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getConfig } from './config.ts';
import {
  createSupabaseAdmin,
  getDeferAttempts,
  getExpectedNextLedger,
  getLastLedger,
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
  process: (db: SupabaseClient, event: rpc.Api.EventResponse) => Promise<string | null>;
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
}): ContractHandler {
  return {
    name: cfg.name,
    contractId: cfg.contractId,
    affectsLeaderboard: cfg.affectsLeaderboard,
    async process(db, event) {
      const parsed = cfg.parser(event);
      if (parsed == null) return null;
      await cfg.writer(db, parsed);
      return parsed.type;
    },
  };
}

interface ContractIndexerResult {
  processed: number;
  errors: number;
  lastLedger: number;
  events: Record<string, number>;
}

const GAP_THRESHOLD = 100;

// After this many consecutive runs deferring a contract's batch on a retryable
// (foreign-key) write failure, give up deferring and skip the offending event
// so a permanently-unresolvable parent (e.g. a dropped/unparseable Registered)
// cannot wedge the stream forever. The skip is logged at error level.
const MAX_DEFER_ATTEMPTS = 5;

export interface IndexerResult {
  processed: number;
  errors: number;
  contracts: Record<string, ContractIndexerResult & { expectedNextLedger?: number }>;
  skipped?: boolean;
  gaps: Array<{ contract: string; expectedLedger: number; actualLedger: number; gapSize: number }>;
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

export async function runIndexer(): Promise<IndexerResult> {
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
    return { processed: 0, errors: 0, contracts: {}, skipped: true, gaps: [] };
  }

  try {
    return await runIndexerLoop(rpcServer, db, config);
  } finally {
    await db.rpc('release_indexer_lock', { p_owner: lockOwner });
  }
}

async function runIndexerLoop(
  rpcServer: StellarSdk.rpc.Server,
  db: SupabaseClient,
  config: ReturnType<typeof getConfig>,
): Promise<IndexerResult> {

  // Identity is processed first so that an agent's `Registered` row exists
  // before any feedback/validation row that references it via foreign key.
  const contracts: ContractHandler[] = [
    defineContract({
      name: 'identity',
      contractId: config.contracts.identity,
      affectsLeaderboard: false,
      parser: parseIdentityEvent,
      writer: writeIdentityEvent,
    }),
    defineContract({
      name: 'reputation',
      contractId: config.contracts.reputation,
      affectsLeaderboard: true,
      parser: parseReputationEvent,
      writer: writeReputationEvent,
    }),
    defineContract({
      name: 'validation',
      contractId: config.contracts.validation,
      affectsLeaderboard: true,
      parser: parseValidationEvent,
      writer: writeValidationEvent,
    }),
  ];

  const result: IndexerResult = {
    processed: 0,
    errors: 0,
    contracts: {},
    gaps: [],
  };
  let needsLeaderboardRefresh = false;
  const { sequence: latestLedger } = await rpcServer.getLatestLedger();

  for (const contract of contracts) {
    const contractResult: ContractIndexerResult = {
      processed: 0,
      errors: 0,
      lastLedger: 0,
      events: {},
    };

    const lastLedger = await getLastLedger(db, contract.name);
    const expectedNext = await getExpectedNextLedger(db, contract.name);
    const deferAttempts = await getDeferAttempts(db, contract.name);
    // Once we have deferred this batch too many times, the failure is almost
    // certainly not transient. Switch to skip mode so the checkpoint can move
    // past the offending event instead of stalling the stream indefinitely.
    const skipRetryableErrors = deferAttempts >= MAX_DEFER_ATTEMPTS;

    if (lastLedger >= latestLedger) {
      contractResult.lastLedger = lastLedger;
      result.contracts[contract.name] = { ...contractResult, expectedNextLedger: expectedNext ?? undefined };
      continue;
    }

    const startLedger =
      lastLedger === 0 ? config.deployLedger : lastLedger + 1;

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
    // Set when a write fails because a referenced parent row (e.g. an agent
    // that identity has not indexed yet this run) does not exist. We stop and
    // leave the checkpoint un-advanced so the batch is retried next run, by
    // which point the prerequisite contract will have caught up. Writes are
    // idempotent upserts, so re-processing is safe.
    let retryableWriteFailure = false;

    log({
      level: 'info',
      msg: 'Indexing contract',
      contract: contract.name,
      startLedger,
      latestLedger,
    });

    while (true) {
      const request: rpc.Api.GetEventsRequest = cursor
        ? {
            filters: [{ type: 'contract', contractIds: [contract.contractId] }],
            cursor,
          }
        : {
            filters: [{ type: 'contract', contractIds: [contract.contractId] }],
            startLedger,
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

      for (const event of response.events) {
        try {
          const eventType = await contract.process(db, event);

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
            log({
              level: 'error',
              msg: 'Event processing error',
              contract: contract.name,
              eventId: event.id,
              error: error instanceof Error ? error.message : String(error),
            });
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
    // the checkpoint un-advanced because of a retryable write failure.
    const nextDeferAttempts = scanCompleted ? 0 : deferAttempts + 1;
    await updateCheckpoint(
      db,
      contract.name,
      contractResult.lastLedger,
      cursor,
      nextExpected,
      nextDeferAttempts,
    );

    log({
      level: 'info',
      msg: 'Contract indexing complete',
      contract: contract.name,
      processed: contractResult.processed,
      errors: contractResult.errors,
      lastLedger: contractResult.lastLedger,
      events: contractResult.events,
    });

    result.processed += contractResult.processed;
    result.errors += contractResult.errors;
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
