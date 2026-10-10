// AUTO-GENERATED from packages/indexer/src/db.ts — DO NOT EDIT.
// Regenerate with: pnpm --filter @stellar8004/indexer sync:shared

import { Networks } from '@stellar/stellar-sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NetworkConfig } from './config.ts';
import { env, requireEnv } from './env.ts';
import type { EventPacket } from './events.ts';

export interface DeploymentBinding {
  network: string;
  networkPassphrase: string;
  contracts: NetworkConfig['contracts'];
}
export function deploymentBinding(config: NetworkConfig): DeploymentBinding {
  return {
    network:
      config.networkPassphrase === Networks.PUBLIC
        ? 'mainnet'
        : config.networkPassphrase === Networks.TESTNET
          ? 'testnet'
          : 'custom',
    networkPassphrase: config.networkPassphrase,
    contracts: { ...config.contracts },
  };
}
export function sourceIdentity(config: NetworkConfig): string {
  return JSON.stringify({
    schema: 'rpc-operation-v1',
    endpoint: new URL(config.rpcUrl).href,
    ...deploymentBinding(config),
  });
}
export interface Stream<S> {
  id: string;
  source: string;
  revision: number;
  state: S | null;
  updatedAt: string;
}
export interface CoverageGap {
  contract: string;
  startLedger: number;
  endLedger: number;
}
export interface CommitResult<S> {
  stream: Stream<S>;
  applied: number;
  superseded: number;
}
export type LeaderboardRefreshMode = 'throttled' | 'force';
export interface ProjectionStore {
  read<S>(id: string, source: string): Promise<Stream<S>>;
  checkpoint(contract: string): Promise<number>;
  missingAgents(ids: readonly number[]): Promise<number[]>;
  refreshLeaderboard(mode?: LeaderboardRefreshMode): Promise<void>;
  commit<S>(
    stream: Stream<S>,
    events: readonly EventPacket[],
    state: S,
    gap?: CoverageGap,
  ): Promise<CommitResult<S>>;
}

export class IndexerWriteError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'IndexerWriteError';
  }
}
function checked<T>(
  result: { data: T; error: { message: string; code?: string } | null },
  context: string,
): T {
  if (result.error)
    throw new IndexerWriteError(`${context}: ${result.error.message}`, result.error.code);
  return result.data;
}

export function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    requireEnv('SUPABASE_URL'),
    env('SUPABASE_SERVICE_ROLE_KEY') || requireEnv('SUPABASE_SERVICE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** The only canonical write boundary: owner, events and progress travel together. */
export class IndexerStore implements ProjectionStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly owner: string,
    private readonly binding: DeploymentBinding,
    private readonly signal?: AbortSignal,
  ) {}

  async acquire(kind: 'live' | 'backfill'): Promise<boolean> {
    const query = this.db.rpc('acquire_indexer_lease', {
      p_owner: this.owner,
      p_binding: this.binding,
      p_kind: kind,
    });
    const data = checked(
      await (this.signal ? query.abortSignal(this.signal) : query),
      'acquire indexer lease',
    );
    if (typeof data !== 'boolean') throw new Error('Invalid indexer lock acquisition result');
    return data;
  }

  async release(): Promise<void> {
    // Release must still run after the work signal has been aborted. Bound its
    // own HTTP wait; the server-side owner check protects a successor's lease.
    checked(
      await this.db
        .rpc('release_indexer_lock', { p_owner: this.owner })
        .abortSignal(AbortSignal.timeout(10_000)),
      'release indexer lease',
    );
  }

  async read<S>(id: string, source: string): Promise<Stream<S>> {
    const query = this.db
      .from('indexer_streams')
      .select('source,revision,state,updated_at')
      .eq('id', id);
    const row = checked(
      await (this.signal ? query.abortSignal(this.signal) : query).maybeSingle(),
      `read stream ${id}`,
    );
    if (row && row.source !== source) throw new Error(`Indexer source mismatch: ${id}`);
    if (row && (!Number.isSafeInteger(row.revision) || row.revision < 0))
      throw new Error(`Invalid stream revision: ${id}`);
    return {
      id,
      source,
      revision: row?.revision ?? 0,
      state: row?.state ?? null,
      updatedAt: row?.updated_at ?? '',
    };
  }

  async checkpoint(contract: string): Promise<number> {
    const query = this.db.from('indexer_state').select('last_ledger').eq('id', contract);
    const row = checked(
      await (this.signal ? query.abortSignal(this.signal) : query).single(),
      `read checkpoint ${contract}`,
    );
    const ledger = Number(row?.last_ledger);
    if (!Number.isSafeInteger(ledger) || ledger < 0)
      throw new Error(`Invalid checkpoint: ${contract}`);
    return ledger;
  }

  async missingAgents(ids: readonly number[]): Promise<number[]> {
    if (!ids.length) return [];
    const query = this.db
      .from('agents')
      .select('id')
      .in('id', [...ids]);
    const rows = checked(
      await (this.signal ? query.abortSignal(this.signal) : query),
      'read registration prerequisites',
    );
    const existing = new Set((rows ?? []).map((row) => row.id));
    return [...new Set(ids)].filter((id) => !existing.has(id));
  }

  async commit<S>(
    stream: Stream<S>,
    events: readonly EventPacket[],
    state: S,
    gap?: CoverageGap,
  ): Promise<CommitResult<S>> {
    this.signal?.throwIfAborted();
    if (events.length > 200) throw new Error('Indexer batch exceeds 200 events');
    // Convert only bigint scalars; no lossy Number conversion or independent
    // per-event/bulk mapping that could silently filter an input row.
    const serialized: unknown = JSON.parse(
      JSON.stringify(events, (_, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );
    const query = this.db.rpc('commit_indexer_batch', {
      p_owner: this.owner,
      p_binding: this.binding,
      p_stream: stream.id,
      p_source: stream.source,
      p_revision: stream.revision,
      p_events: serialized,
      p_progress: state,
      p_gap: gap ?? null,
    });
    const receipt = checked(
      await (this.signal ? query.abortSignal(this.signal) : query),
      `commit stream ${stream.id}`,
    );
    if (
      !receipt ||
      receipt.revision !== stream.revision + 1 ||
      !Number.isInteger(receipt.applied) ||
      receipt.applied < 0 ||
      !Number.isInteger(receipt.superseded) ||
      receipt.superseded < 0 ||
      receipt.applied + receipt.superseded !== events.length
    )
      throw new Error('Invalid indexer commit receipt');
    return {
      stream: { ...stream, state, revision: receipt.revision, updatedAt: new Date().toISOString() },
      applied: receipt.applied,
      superseded: receipt.superseded,
    };
  }

  async refreshLeaderboard(mode: LeaderboardRefreshMode = 'throttled'): Promise<void> {
    const query = this.db.rpc(
      mode === 'force' ? 'refresh_leaderboard_force' : 'refresh_leaderboard',
    );
    checked(await (this.signal ? query.abortSignal(this.signal) : query), 'refresh leaderboard');
  }
}
