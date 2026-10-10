import type {
  CommitResult,
  CoverageGap,
  LeaderboardRefreshMode,
  ProjectionStore,
  Stream,
} from '../db.js';
import type { EventPacket } from '../events.js';

/** In-memory orchestration double. SQL semantics are tested by tests/postgres.py. */
export class MemoryStore implements ProjectionStore {
  streams = new Map<string, Stream<unknown>>();
  checkpoints = new Map<string, number>();
  events: EventPacket[] = [];
  gaps: CoverageGap[] = [];
  agents = new Set<number>();
  failure: Error | null = null;
  afterCommit: (() => void) | undefined;
  refreshModes: LeaderboardRefreshMode[] = [];
  refreshFailure: Error | undefined;
  afterRefresh: (() => void) | undefined;
  async refreshLeaderboard(mode: LeaderboardRefreshMode = 'throttled'): Promise<void> {
    this.refreshModes.push(mode);
    if (this.refreshFailure) throw this.refreshFailure;
    this.afterRefresh?.();
  }
  async read<S>(id: string, source: string): Promise<Stream<S>> {
    const row = this.streams.get(id);
    if (row && row.source !== source) throw new Error('source mismatch');
    return structuredClone(
      row ?? { id, source, revision: 0, state: null, updatedAt: '' },
    ) as Stream<S>;
  }
  async checkpoint(name: string) {
    return this.checkpoints.get(name) ?? 0;
  }
  async missingAgents(ids: readonly number[]) {
    return ids.filter((id) => !this.agents.has(id));
  }
  async commit<S>(
    stream: Stream<S>,
    events: readonly EventPacket[],
    state: S,
    gap?: CoverageGap,
  ): Promise<CommitResult<S>> {
    if (this.failure) throw this.failure;
    if ((this.streams.get(stream.id)?.revision ?? 0) !== stream.revision)
      throw new Error('revision mismatch');
    const next = {
      ...stream,
      revision: stream.revision + 1,
      state: structuredClone(state),
      updatedAt: new Date().toISOString(),
    };
    this.streams.set(stream.id, next);
    this.events.push(...events);
    events.forEach((e) => {
      if (e.data.type === 'Registered') this.agents.add(e.data.agentId);
    });
    if (gap) this.gaps.push(gap);
    this.afterCommit?.();
    return { stream: next, applied: events.length, superseded: 0 };
  }
}
