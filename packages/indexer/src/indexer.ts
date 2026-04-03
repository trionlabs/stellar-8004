import * as StellarSdk from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getConfig } from './config.js';
import {
  createSupabaseAdmin,
  getLastLedger,
  refreshLeaderboard,
  updateCheckpoint,
  writeIdentityEvent,
  writeReputationEvent,
  writeValidationEvent,
} from './db.js';
import { parseIdentityEvent } from './parsers/identity.js';
import { parseReputationEvent } from './parsers/reputation.js';
import { parseValidationEvent } from './parsers/validation.js';

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
}

export interface IndexerResult {
  processed: number;
  errors: number;
  contracts: Record<string, ContractIndexerResult>;
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
  };
  let needsLeaderboardRefresh = false;
  const { sequence: latestLedger } = await rpcServer.getLatestLedger();

  for (const contract of contracts) {
    const contractResult: ContractIndexerResult = {
      processed: 0,
      errors: 0,
      lastLedger: 0,
    };

    const lastLedger = await getLastLedger(db, contract.name);

    if (lastLedger >= latestLedger) {
      contractResult.lastLedger = lastLedger;
      result.contracts[contract.name] = contractResult;
      continue;
    }

    const startLedger =
      lastLedger === 0 ? Math.max(1, latestLedger - 17_280) : lastLedger + 1;

    let cursor: string | undefined;
    let maxLedger = startLedger;

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
        response = await rpcServer.getEvents(request);
      } catch (error) {
        console.error(`[${contract.name}] RPC getEvents error:`, error);
        contractResult.errors++;
        break;
      }

      for (const event of response.events) {
        try {
          const parsed = contract.parser(event);

          if (parsed != null) {
            await contract.writer(db, parsed);
            contractResult.processed++;

            if (contract.affectsLeaderboard) {
              needsLeaderboardRefresh = true;
            }
          }
        } catch (error) {
          console.error(`[${contract.name}] Event ${event.id} error:`, error);
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

    contractResult.lastLedger = Math.max(maxLedger, latestLedger);
    await updateCheckpoint(db, contract.name, contractResult.lastLedger, cursor);

    result.processed += contractResult.processed;
    result.errors += contractResult.errors;
    result.contracts[contract.name] = contractResult;
  }

  if (needsLeaderboardRefresh) {
    try {
      await refreshLeaderboard(db);
    } catch (error) {
      console.error('[leaderboard] refresh error:', error);
      result.errors++;
    }
  }

  return result;
}
