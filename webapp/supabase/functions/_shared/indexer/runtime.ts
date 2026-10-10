// AUTO-GENERATED from packages/indexer/src/runtime.ts — DO NOT EDIT.
// Regenerate with: pnpm --filter @stellar8004/indexer sync:shared

import { rpc, StrKey } from '@stellar/stellar-sdk';
import type { NetworkConfig } from './config.ts';
import { createSupabaseAdmin, deploymentBinding, IndexerStore } from './db.ts';
import { log } from './logger.ts';

export interface RunOptions {
  deadlineMs?: number;
  signal?: AbortSignal;
}
export interface WorkBudget {
  expired(): boolean;
  check(): void;
}
export class BudgetExceeded extends Error {
  constructor() {
    super('Indexer time budget reached');
  }
}

/** SDK15's constructor ignores timeout. Install a per-instance transport so
 * Node and Deno share effective cancellation, including response-body reads. */
export function createRpcServer(url: string, signal: AbortSignal): rpc.Server {
  const server = new rpc.Server(url, { allowHttp: url.startsWith('http://') });
  server.httpClient.defaults.adapter = async (request) => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(
      () => controller.abort(new Error('Stellar RPC request timeout')),
      10_000,
    );
    try {
      controller.signal.throwIfAborted();
      const response = await fetch(String(request.url), {
        method: request.method?.toUpperCase() ?? 'POST',
        headers: new Headers(request.headers),
        body: typeof request.data === 'string' ? request.data : JSON.stringify(request.data),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Stellar RPC HTTP ${response.status}`);
      const data: unknown = await response.json();
      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        config: request,
      };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  };
  return server;
}

/** Bounded ownership shared by live and historical callers. No heartbeat. */
export async function withIndexerLease<T>(
  config: NetworkConfig,
  kind: 'live' | 'backfill',
  options: RunOptions,
  work: (context: {
    rpc: rpc.Server;
    store: IndexerStore;
    budget: WorkBudget;
    head: number;
  }) => Promise<T>,
): Promise<T | null> {
  if (!config.rpcUrl || !Number.isSafeInteger(config.deployLedger) || config.deployLedger < 0)
    throw new Error('Invalid indexer configuration');
  const addresses = Object.values(config.contracts);
  if (
    addresses.length !== 3 ||
    new Set(addresses).size !== 3 ||
    addresses.some((id) => !StrKey.isValidContract(id))
  )
    throw new Error('Invalid indexer contract configuration');
  const deadline = Math.min(options.deadlineMs ?? Infinity, Date.now() + 110_000);
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(
    () => controller.abort(new BudgetExceeded()),
    Math.max(1, deadline + 10_000 - Date.now()),
  );
  const budget: WorkBudget = {
    expired: () => Date.now() >= deadline || controller.signal.aborted,
    check: () => {
      if (Date.now() >= deadline || controller.signal.aborted) throw new BudgetExceeded();
    },
  };
  let store: IndexerStore | undefined;
  let acquired = false;
  try {
    const server = createRpcServer(config.rpcUrl, controller.signal);
    store = new IndexerStore(
      createSupabaseAdmin(),
      crypto.randomUUID(),
      deploymentBinding(config),
      controller.signal,
    );
    budget.check();
    const [network, version, latest] = await Promise.all([
      server.getNetwork(),
      server.getVersionInfo(),
      server.getLatestLedger(),
    ]);
    budget.check();
    if (network.passphrase !== config.networkPassphrase)
      throw new Error('RPC network passphrase mismatch');
    const major = Number(/^v?(\d+)\./.exec(version.version)?.[1]);
    if (!Number.isSafeInteger(major) || major < 23)
      throw new Error('Indexer requires RPC v23+ operation-event identities');
    if (
      !Number.isSafeInteger(latest.sequence) ||
      latest.sequence < 1 ||
      latest.sequence > 0x7fffffff
    )
      throw new Error('Invalid RPC head ledger');
    acquired = await store.acquire(kind);
    if (!acquired) return null;
    budget.check();
    return await work({ rpc: server, store, budget, head: latest.sequence });
  } finally {
    if (acquired && store) {
      try {
        await store.release();
      } catch (error) {
        log({
          level: 'error',
          msg: 'Failed to release indexer lease; expiry will recover it',
          error: String(error),
        });
      }
    }
    clearTimeout(timer);
    controller.abort();
    options.signal?.removeEventListener('abort', abort);
  }
}
