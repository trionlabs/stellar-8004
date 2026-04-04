import * as StellarSdk from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getConfig } from './config.js';
import {
  createSupabaseAdmin,
  getExpectedNextLedger,
  getLastLedger,
  refreshLeaderboard,
  updateCheckpoint,
  writeIdentityEvent,
  writeReputationEvent,
  writeValidationEvent,
} from './db.js';
import { log } from './logger.js';
import { parseIdentityEvent } from './parsers/identity.js';
import { parseReputationEvent } from './parsers/reputation.js';
import { parseValidationEvent } from './parsers/validation.js';
import { withRetry } from './retry.js';

interface ContractIndexConfig {
  name: string;
  contractId: string;
  parser: (event: rpc.Api.EventResponse) => unknown;
  writer: (db: SupabaseClient, event: any) => Promise<void>;
  affectsLeaderboard: boolean;
}

interface ContractIndexerResult {
  processed: number;
  errors: number;
  lastLedger: number;
  events: Record<string, number>;
}

const GAP_THRESHOLD = 100;

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

  // Concurrent run guard (table-based lock, pgBouncer-safe)
  const lockResult = await db.rpc('acquire_indexer_lock');
  if (!lockResult.data) {
    log({ level: 'warn', msg: 'Another instance is running, skipping' });
    return { processed: 0, errors: 0, contracts: {}, skipped: true, gaps: [] };
  }

  try {
    return await runIndexerLoop(rpcServer, db, config);
  } finally {
    await db.rpc('release_indexer_lock');
  }
}

async function runIndexerLoop(
  rpcServer: StellarSdk.rpc.Server,
  db: SupabaseClient,
  config: ReturnType<typeof getConfig>,
): Promise<IndexerResult> {

  const contracts: ContractIndexConfig[] = [
    {
      name: 'identity',
      contractId: config.contracts.identity,
      parser: parseIdentityEvent,
      writer: writeIdentityEvent,
      affectsLeaderboard: false,
    },
    {
      name: 'reputation',
      contractId: config.contracts.reputation,
      parser: parseReputationEvent,
      writer: writeReputationEvent,
      affectsLeaderboard: true,
    },
    {
      name: 'validation',
      contractId: config.contracts.validation,
      parser: parseValidationEvent,
      writer: writeValidationEvent,
      affectsLeaderboard: true,
    },
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

    if (lastLedger >= latestLedger) {
      contractResult.lastLedger = lastLedger;
      result.contracts[contract.name] = { ...contractResult, expectedNextLedger: expectedNext ?? undefined };
      continue;
    }

    const startLedger =
      lastLedger === 0 ? Math.max(1, latestLedger - 4_320) : lastLedger + 1;

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
          const parsed = contract.parser(event);

          if (parsed != null) {
            await contract.writer(db, parsed);
            contractResult.processed++;

            const eventType = (parsed as { type?: string })?.type ?? 'unknown';
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
          log({
            level: 'error',
            msg: 'Event processing error',
            contract: contract.name,
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
          });
          contractResult.errors++;
        }

        if (event.ledger > maxLedger) {
          maxLedger = event.ledger;
        }
      }

      if (response.events.length > 0 && response.cursor) {
        cursor = response.cursor;
        continue;
      }

      break;
    }

    contractResult.lastLedger =
      scanCompleted && contractResult.processed > 0
        ? Math.max(maxLedger, latestLedger)
        : lastLedger;
    const nextExpected =
      scanCompleted && contractResult.processed > 0
        ? latestLedger + 1
        : expectedNext ?? undefined;
    await updateCheckpoint(db, contract.name, contractResult.lastLedger, cursor, nextExpected);

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
