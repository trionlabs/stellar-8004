import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeToScVal } from '@stellar/stellar-sdk';

const mocks = vi.hoisted(() => ({
  config: {
    rpcUrl: 'https://rpc.example.com',
    networkPassphrase: 'Test network',
    contracts: {
      identity: 'CIDENTITY',
      reputation: 'CREPUTATION',
      validation: 'CVALIDATION',
    },
    deployLedger: 100,
  },
  db: {} as Record<string, unknown>,
  serverCtor: vi.fn(),
  getLatestLedger: vi.fn(),
  getEvents: vi.fn(),
  createSupabaseAdmin: vi.fn(),
  getCheckpointState: vi.fn(),
  updateCheckpoint: vi.fn(),
  recordDeadLetter: vi.fn(),
  refreshLeaderboard: vi.fn(),
  writeIdentityEvent: vi.fn(),
  writeReputationEvent: vi.fn(),
  writeValidationEvent: vi.fn(),
  bulkUpsertRegistered: vi.fn(),
  bulkUpsertMetadataSet: vi.fn(),
  bulkUpsertNewFeedback: vi.fn(),
  bulkUpsertValidationRequest: vi.fn(),
  parseIdentityEvent: vi.fn(),
  parseReputationEvent: vi.fn(),
  parseValidationEvent: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return { ...actual, rpc: { ...actual.rpc, Server: mocks.serverCtor } };
});

vi.mock('./config.js', () => ({
  getConfig: vi.fn(() => mocks.config),
}));

vi.mock('./db.js', () => ({
  createSupabaseAdmin: mocks.createSupabaseAdmin,
  getCheckpointState: mocks.getCheckpointState,
  updateCheckpoint: mocks.updateCheckpoint,
  recordDeadLetter: mocks.recordDeadLetter,
  refreshLeaderboard: mocks.refreshLeaderboard,
  writeIdentityEvent: mocks.writeIdentityEvent,
  writeReputationEvent: mocks.writeReputationEvent,
  writeValidationEvent: mocks.writeValidationEvent,
  bulkUpsertRegistered: mocks.bulkUpsertRegistered,
  bulkUpsertMetadataSet: mocks.bulkUpsertMetadataSet,
  bulkUpsertNewFeedback: mocks.bulkUpsertNewFeedback,
  bulkUpsertValidationRequest: mocks.bulkUpsertValidationRequest,
  isRetryableWriteError: (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { retryable?: boolean }).retryable === true,
}));

vi.mock('./parsers/identity.js', () => ({
  IDENTITY_EVENT_NAMES: new Set(['registered', 'uri_updated', 'metadata_set', 'agent_wallet_set', 'agent_wallet_unset', 'transfer']),
  parseIdentityEvent: mocks.parseIdentityEvent,
}));

vi.mock('./parsers/reputation.js', () => ({
  REPUTATION_EVENT_NAMES: new Set(['new_feedback', 'feedback_revoked', 'response_appended']),
  parseReputationEvent: mocks.parseReputationEvent,
}));

vi.mock('./parsers/validation.js', () => ({
  VALIDATION_EVENT_NAMES: new Set(['validation_request', 'validation_response']),
  parseValidationEvent: mocks.parseValidationEvent,
}));

import { runIndexer } from './indexer.js';

describe('runIndexer', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();

    mocks.serverCtor.mockImplementation(() => ({
      getLatestLedger: mocks.getLatestLedger,
      getEvents: mocks.getEvents,
    }));

    mocks.createSupabaseAdmin.mockReturnValue(mocks.db);
    mocks.getLatestLedger.mockResolvedValue({ sequence: 20 });
    mocks.getCheckpointState.mockResolvedValue({ lastLedger: 10, expectedNext: null, deferAttempts: 0 });
    mocks.getEvents.mockResolvedValue({ events: [], cursor: undefined, oldestLedger: 1 });

    mocks.parseIdentityEvent.mockReturnValue({ id: 'identity' });
    mocks.parseReputationEvent.mockReturnValue({ id: 'reputation' });
    mocks.parseValidationEvent.mockReturnValue({ id: 'validation' });

    mocks.writeIdentityEvent.mockResolvedValue(undefined);
    mocks.writeReputationEvent.mockResolvedValue(undefined);
    mocks.writeValidationEvent.mockResolvedValue(undefined);
    mocks.bulkUpsertRegistered.mockResolvedValue(undefined);
    mocks.bulkUpsertMetadataSet.mockResolvedValue(undefined);
    mocks.bulkUpsertNewFeedback.mockResolvedValue(undefined);
    mocks.bulkUpsertValidationRequest.mockResolvedValue(undefined);
    mocks.recordDeadLetter.mockResolvedValue(undefined);
    mocks.updateCheckpoint.mockResolvedValue(undefined);
    mocks.refreshLeaderboard.mockResolvedValue(undefined);

    mocks.db.rpc = vi.fn().mockImplementation((name: string) => {
      if (name === 'acquire_indexer_lock') return Promise.resolve({ data: true });
      if (name === 'release_indexer_lock') return Promise.resolve({ data: undefined });
      return Promise.resolve({ data: null, error: null });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('advances checkpoints to latest ledger even when no events are processed', async () => {
    const result = await runIndexer();

    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.gaps).toEqual([]);
    expect(result.contracts.identity.lastLedger).toBe(20);
    expect(result.contracts.reputation.lastLedger).toBe(20);
    expect(result.contracts.validation.lastLedger).toBe(20);
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      20,
      21,
      0,
      true,
    );
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      2,
      mocks.db,
      'reputation',
      20,
      21,
      0,
      true,
    );
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      3,
      mocks.db,
      'validation',
      20,
      21,
      0,
      true,
    );
    expect(mocks.refreshLeaderboard).not.toHaveBeenCalled();
  });

  it('retries getEvents and succeeds on a later attempt', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0);

    mocks.getEvents
      .mockRejectedValueOnce(new Error('temporary rpc error'))
      .mockResolvedValue({ events: [], cursor: undefined, oldestLedger: 1 });

    const promise = runIndexer();

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result.errors).toBe(0);
    expect(result.gaps).toEqual([]);
    // 1 rejected + 1 retried-ok oldest-ledger probe (memoized for the run),
    // then one scan per contract = 5 calls.
    expect(mocks.getEvents).toHaveBeenCalledTimes(5);
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      20,
      21,
      0,
      true,
    );
  });

  it('returns skipped: true when lock cannot be acquired', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    (mocks.db.rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === 'acquire_indexer_lock') return Promise.resolve({ data: false });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await runIndexer();

    expect(result.skipped).toBe(true);
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.gaps).toEqual([]);
    expect(console.warn).toHaveBeenCalled();

    const warnCall = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const logEntry = JSON.parse(warnCall);
    expect(logEntry.msg).toBe('Another instance is running, skipping');
  });

  it('detects ledger gaps when startLedger exceeds expectedNextLedger + GAP_THRESHOLD', async () => {
    mocks.getLatestLedger.mockResolvedValue({ sequence: 2000 });
    mocks.getCheckpointState.mockResolvedValue({ lastLedger: 1000, expectedNext: 800, deferAttempts: 0 });

    const result = await runIndexer();

    expect(result.gaps).toHaveLength(3);
    expect(result.gaps[0].contract).toBe('identity');
    expect(result.gaps[0].expectedLedger).toBe(800);
    expect(result.gaps[0].actualLedger).toBe(1001);
    expect(result.gaps[0].gapSize).toBe(201);
    expect(result.gaps[1].contract).toBe('reputation');
    expect(result.gaps[2].contract).toBe('validation');
  });

  it('tracks per-event-type counters', async () => {
    mocks.getEvents.mockResolvedValue({
      events: [
        { id: 'evt-1', ledger: 15, topic: ['t1'], inSuccessfulContractCall: true },
        { id: 'evt-2', ledger: 16, topic: ['t2'], inSuccessfulContractCall: true },
      ],
      cursor: undefined,
    });

    mocks.parseIdentityEvent.mockReturnValueOnce({ type: 'Registered' });
    mocks.parseIdentityEvent.mockReturnValueOnce({ type: 'UriUpdated' });

    const result = await runIndexer();

    expect(result.contracts.identity.events).toEqual({
      Registered: 1,
      UriUpdated: 1,
    });
    expect(result.contracts.identity.processed).toBe(2);
  });

  it('collapses a homogeneous bulk-upsertable page into a single bulkWrite', async () => {
    mocks.getEvents.mockResolvedValue({
      events: [
        { id: 'f1', ledger: 15, topic: ['t'], inSuccessfulContractCall: true },
        { id: 'f2', ledger: 16, topic: ['t'], inSuccessfulContractCall: true },
      ],
      cursor: undefined,
    });
    // Both reputation events parse to the same bulk-upsertable type.
    mocks.parseReputationEvent.mockReturnValue({ type: 'NewFeedback' });

    const result = await runIndexer();

    expect(mocks.bulkUpsertNewFeedback).toHaveBeenCalledTimes(1);
    expect(mocks.bulkUpsertNewFeedback).toHaveBeenCalledWith(mocks.db, [
      { type: 'NewFeedback' },
      { type: 'NewFeedback' },
    ]);
    // The per-event writer is bypassed entirely on the fast path.
    expect(mocks.writeReputationEvent).not.toHaveBeenCalled();
    expect(result.contracts.reputation.processed).toBe(2);
    expect(result.contracts.reputation.events).toEqual({ NewFeedback: 2 });
  });

  it('falls back to the per-event path when a bulk page upsert fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getEvents.mockResolvedValue({
      events: [
        { id: 'f1', ledger: 15, topic: ['t'], inSuccessfulContractCall: true },
        { id: 'f2', ledger: 16, topic: ['t'], inSuccessfulContractCall: true },
      ],
      cursor: undefined,
    });
    mocks.parseReputationEvent.mockReturnValue({ type: 'NewFeedback' });
    mocks.bulkUpsertNewFeedback.mockRejectedValue(new Error('bulk boom'));

    const result = await runIndexer();

    expect(mocks.bulkUpsertNewFeedback).toHaveBeenCalledTimes(1);
    // Fallback re-applies each event individually (idempotent upserts).
    expect(mocks.writeReputationEvent).toHaveBeenCalledTimes(2);
    expect(result.contracts.reputation.processed).toBe(2);
    expect(result.contracts.reputation.events).toEqual({ NewFeedback: 2 });
  });

  it('keeps the per-event path for a mixed-type page (no bulk)', async () => {
    mocks.getEvents.mockResolvedValue({
      events: [
        { id: 'f1', ledger: 15, topic: ['t'], inSuccessfulContractCall: true },
        { id: 'f2', ledger: 16, topic: ['t'], inSuccessfulContractCall: true },
      ],
      cursor: undefined,
    });
    mocks.parseReputationEvent
      .mockReturnValueOnce({ type: 'NewFeedback' })
      .mockReturnValueOnce({ type: 'FeedbackRevoked' });

    const result = await runIndexer();

    expect(mocks.bulkUpsertNewFeedback).not.toHaveBeenCalled();
    expect(mocks.writeReputationEvent).toHaveBeenCalledTimes(2);
    expect(result.contracts.reputation.events).toEqual({
      NewFeedback: 1,
      FeedbackRevoked: 1,
    });
  });

  it('does not advance checkpoints after a partial scan if a later page fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    mocks.getCheckpointState.mockImplementation((_db: unknown, contractName: string) =>
      Promise.resolve({
        lastLedger: contractName === 'identity' ? 10 : 20,
        expectedNext: null,
        deferAttempts: 0,
      }),
    );
    mocks.getEvents
      // First call is the oldest-ledger probe; keep it in range so no clamp.
      .mockResolvedValueOnce({ events: [], cursor: undefined, oldestLedger: 1 })
      .mockResolvedValueOnce({
        events: [
          { id: 'evt-1', ledger: 15, topic: ['t1'], inSuccessfulContractCall: true },
        ],
        cursor: 'cursor-1',
      })
      .mockRejectedValue(new Error('page 2 failed'));
    mocks.parseIdentityEvent.mockReturnValue({ type: 'Registered' });

    const promise = runIndexer();

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.contracts.identity.lastLedger).toBe(10);
    // A transient getEvents FETCH failure leaves the checkpoint un-advanced but
    // must NOT increment the write-defer counter (stays 0) — otherwise RPC
    // flakiness could arm the skip-after-N escape hatch (report #5).
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      10,
      undefined,
      0,
      false,
    );
  });

  it('a transient getEvents failure preserves (never increments) the defer counter', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // identity has already accrued 4 write-defers; reputation/validation are
    // caught up. A pure RPC fetch failure this run must leave the counter at 4
    // (not bump it to 5 and trip the skip-after-N escape hatch).
    mocks.getCheckpointState.mockImplementation((_db: unknown, contractName: string) =>
      Promise.resolve({
        lastLedger: contractName === 'identity' ? 10 : 20,
        expectedNext: null,
        deferAttempts: contractName === 'identity' ? 4 : 0,
      }),
    );
    mocks.getEvents
      // oldest-ledger probe (in range, no clamp)
      .mockResolvedValueOnce({ events: [], cursor: undefined, oldestLedger: 1 })
      // first real page fails outright
      .mockRejectedValue(new Error('rpc temporarily unavailable'));

    const promise = runIndexer();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.errors).toBe(1);
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      10,
      undefined,
      4,
      false,
    );
  });

  it('defers the batch without advancing the checkpoint on a retryable write failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // identity is at ledger 10; reputation/validation are caught up so only
    // identity scans. The writer fails with a retryable (FK) error.
    mocks.getCheckpointState.mockImplementation((_db: unknown, contractName: string) =>
      Promise.resolve({
        lastLedger: contractName === 'identity' ? 10 : 20,
        expectedNext: null,
        deferAttempts: 0,
      }),
    );
    mocks.getEvents.mockResolvedValue({
      events: [{ id: 'evt-1', ledger: 15, topic: ['t1'], inSuccessfulContractCall: true }],
      cursor: undefined,
    });
    mocks.parseIdentityEvent.mockReturnValue({ type: 'Registered' });
    mocks.writeIdentityEvent.mockRejectedValue(
      Object.assign(new Error('fk violation'), { retryable: true }),
    );

    const result = await runIndexer();

    expect(result.processed).toBe(0);
    expect(result.errors).toBe(1);
    // Checkpoint stays at the previous ledger so the deferred event is retried.
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      10,
      undefined,
      1,
      false,
    );

    const warnings = (console.warn as ReturnType<typeof vi.fn>).mock.calls.map(
      ([line]) => JSON.parse(line).msg,
    );
    expect(warnings).toContain('Retryable write failure - deferring batch to next run');
  });

  it.each([5, 100])('keeps retrying a dependency failure after %i deferrals', async (deferAttempts) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getCheckpointState.mockImplementation((_db: unknown, contractName: string) =>
      Promise.resolve({
        lastLedger: contractName === 'identity' ? 10 : 20,
        expectedNext: null,
        deferAttempts: contractName === 'identity' ? deferAttempts : 0,
      }),
    );
    mocks.getEvents.mockResolvedValue({
      events: [{ id: 'evt-1', ledger: 15, topic: ['t1'], inSuccessfulContractCall: true }],
      cursor: undefined,
      oldestLedger: 1,
    });
    mocks.parseIdentityEvent.mockReturnValue({ type: 'Registered' });
    mocks.writeIdentityEvent.mockRejectedValue(
      Object.assign(new Error('fk violation'), { retryable: true }),
    );

    const result = await runIndexer();

    expect(result.processed).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.skippedEvents).toBe(0);
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(mocks.updateCheckpoint).toHaveBeenCalledWith(
      mocks.db, 'identity', 10, undefined, deferAttempts + 1, false,
    );
    expect(mocks.recordDeadLetter).not.toHaveBeenCalled();
  });

  it('defers (does not advance) the checkpoint on a NON-retryable write failure', async () => {
    // Regression guard for the silent-loss bug: a non-retryable write failure
    // (e.g. a transient network error postgrest reports with code='') must NOT
    // let the checkpoint advance past the un-written event. It defers instead.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.getCheckpointState.mockImplementation((_db: unknown, contractName: string) =>
      Promise.resolve({
        lastLedger: contractName === 'identity' ? 10 : 20,
        expectedNext: null,
        deferAttempts: 0,
      }),
    );
    mocks.getEvents.mockResolvedValue({
      events: [{ id: 'evt-1', ledger: 15, topic: ['t1'], inSuccessfulContractCall: true }],
      cursor: undefined,
    });
    mocks.parseIdentityEvent.mockReturnValue({ type: 'Registered' });
    mocks.writeIdentityEvent.mockRejectedValue(
      Object.assign(new Error('network error'), { retryable: false }),
    );

    const result = await runIndexer();

    expect(result.processed).toBe(0);
    expect(result.errors).toBe(1);
    // Checkpoint stays at the previous ledger so the dropped event is retried.
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      10,
      undefined,
      1,
      false,
    );

    const errors = (console.error as ReturnType<typeof vi.fn>).mock.calls.map(
      ([line]) => JSON.parse(line).msg,
    );
    expect(errors).toContain('Write failure - deferring batch to next run');
  });

  it.each([5, 100])('never discards an unclassified outage after %i deferrals', async (deferAttempts) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getCheckpointState.mockImplementation((_db: unknown, contractName: string) =>
      Promise.resolve({
        lastLedger: contractName === 'identity' ? 10 : 20,
        expectedNext: null,
        deferAttempts: contractName === 'identity' ? deferAttempts : 0,
      }),
    );
    mocks.getEvents.mockResolvedValue({
      events: [{ id: 'evt-1', ledger: 15, topic: ['t1'], inSuccessfulContractCall: true }],
      cursor: undefined,
      oldestLedger: 1,
    });
    mocks.parseIdentityEvent.mockReturnValue({ type: 'Registered' });
    mocks.writeIdentityEvent.mockRejectedValue(new Error('connection reset'));

    const result = await runIndexer();

    expect(result.processed).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.skippedEvents).toBe(0);
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(mocks.updateCheckpoint).toHaveBeenCalledWith(
      mocks.db, 'identity', 10, undefined, deferAttempts + 1, false,
    );
    expect(mocks.recordDeadLetter).not.toHaveBeenCalled();
  });

  it('retains coverage when a high-defer bulk fallback fails after a successful event', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getCheckpointState.mockImplementation((_db: unknown, name: string) => Promise.resolve({
      lastLedger: name === 'identity' ? 10 : 20, expectedNext: null, deferAttempts: 100,
    }));
    mocks.getEvents.mockResolvedValue({
      events: [
        { id: 'evt-1', ledger: 14, topic: ['t1'], inSuccessfulContractCall: true },
        { id: 'evt-2', ledger: 15, topic: ['t1'], inSuccessfulContractCall: true },
      ],
      oldestLedger: 1,
    });
    mocks.parseIdentityEvent.mockReturnValue({ type: 'Registered' });
    mocks.bulkUpsertRegistered.mockRejectedValue(new Error('bulk unavailable'));
    mocks.writeIdentityEvent.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network reset'));

    const result = await runIndexer();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.skippedEvents).toBe(0);
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(mocks.updateCheckpoint).toHaveBeenCalledWith(mocks.db, 'identity', 10, undefined, 101, false);
  });

  it('clamps a cold-start scan to the oldest retained ledger', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Fresh checkpoint: deployLedger (100) predates the retention window, whose
    // oldest retained ledger is 5000. The first getEvents (the oldest-ledger
    // probe) reports oldestLedger; the scan must start there, not at 100.
    mocks.getLatestLedger.mockResolvedValue({ sequence: 20000 });
    mocks.getCheckpointState.mockResolvedValue({ lastLedger: 0, expectedNext: null, deferAttempts: 0 });
    mocks.getEvents.mockResolvedValue({ events: [], cursor: undefined, oldestLedger: 5000 });

    const result = await runIndexer();

    const warnings = (console.warn as ReturnType<typeof vi.fn>).mock.calls.map(
      ([line]) => JSON.parse(line).msg,
    );
    expect(warnings).toContain('Start ledger predates RPC retention - clamping to oldest retained');
    // The scan request after the probe must use startLedger = 5000.
    const scanCall = mocks.getEvents.mock.calls.find(
      ([req]) => req.startLedger === 5000,
    );
    expect(scanCall).toBeDefined();
    expect(result.contracts.identity.lastLedger).toBe(20000);
    // Unavailable deployment history is still a coverage gap on a first run.
    expect(mocks.recordDeadLetter).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ contract: 'identity', reason: 'retention-clamp', ledger: 100 }),
    );
  });

  it('does not advance coverage when the retention gap cannot be recorded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getCheckpointState.mockResolvedValue({ lastLedger: 0, expectedNext: null, deferAttempts: 0 });
    mocks.getLatestLedger.mockResolvedValue({ sequence: 20000 });
    mocks.getEvents.mockResolvedValue({ events: [], oldestLedger: 5000 });
    mocks.recordDeadLetter.mockRejectedValue(new Error('gap persistence failed'));

    await expect(runIndexer()).rejects.toThrow('gap persistence failed');
    expect(mocks.updateCheckpoint).not.toHaveBeenCalled();
  });

  it('clamps a resumed checkpoint that has aged out of the retention window', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // The indexer was down longer than the RPC retention window: the saved
    // checkpoint (1000) is now older than the oldest retained ledger (5000).
    // Without clamping, getEvents(startLedger=1001) would hard-fail forever.
    // Only identity has fallen behind; reputation/validation are caught up.
    mocks.getLatestLedger.mockResolvedValue({ sequence: 20000 });
    mocks.getCheckpointState.mockImplementation((_db: unknown, contractName: string) =>
      Promise.resolve({
        lastLedger: contractName === 'identity' ? 1000 : 20000,
        expectedNext: 1001,
        deferAttempts: 0,
      }),
    );
    mocks.getEvents.mockResolvedValue({ events: [], cursor: undefined, oldestLedger: 5000 });

    const result = await runIndexer();

    const warnings = (console.warn as ReturnType<typeof vi.fn>).mock.calls.map(
      ([line]) => JSON.parse(line).msg,
    );
    expect(warnings).toContain('Start ledger predates RPC retention - clamping to oldest retained');
    // The scan resumes from the oldest retained ledger, not the stale checkpoint+1.
    const scanCall = mocks.getEvents.mock.calls.find(
      ([req]) => req.startLedger === 5000,
    );
    expect(scanCall).toBeDefined();
    // The forced-forward jump past the retained window is surfaced as a gap.
    expect(result.gaps.some((g) => g.contract === 'identity')).toBe(true);
    expect(result.contracts.identity.lastLedger).toBe(20000);
    // A resume-clamp drops real on-chain events, so the skipped range is
    // durably dead-lettered (replayable), not just logged (8004 auditing).
    expect(mocks.recordDeadLetter).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ contract: 'identity', reason: 'retention-clamp' }),
    );
  });

  it('does not abort the run when the oldest-ledger probe fails transiently', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0);

    // All three contracts are behind (default checkpoint lastLedger 10 < 20), so
    // all three scan. The first getEvents calls are the identity oldest-ledger
    // probe; make its 3 retry attempts all reject so the probe throws. The run
    // must NOT abort: identity proceeds un-clamped and every contract advances.
    mocks.getEvents
      .mockRejectedValueOnce(new Error('probe rpc error'))
      .mockRejectedValueOnce(new Error('probe rpc error'))
      .mockRejectedValueOnce(new Error('probe rpc error'))
      .mockResolvedValue({ events: [], cursor: undefined, oldestLedger: 1 });

    const promise = runIndexer();

    await vi.runAllTimersAsync();

    const result = await promise;

    const warnings = (console.warn as ReturnType<typeof vi.fn>).mock.calls.map(
      ([line]) => JSON.parse(line).msg,
    );
    expect(warnings).toContain(
      'Oldest-ledger probe failed - skipping retention clamp for this contract',
    );
    // Every contract still advanced to the latest ledger despite the probe blip,
    // and the failure was not counted as a contract error.
    expect(result.errors).toBe(0);
    expect(result.contracts.identity.lastLedger).toBe(20);
    expect(result.contracts.reputation.lastLedger).toBe(20);
    expect(result.contracts.validation.lastLedger).toBe(20);
    expect(mocks.updateCheckpoint).toHaveBeenCalledTimes(3);
  });

  it('stops early and marks timedOut when the soft deadline is reached', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runIndexer({ deadlineMs: Date.now() - 1 });

    expect(result.timedOut).toBe(true);
    // No contract should have been scanned past the deadline.
    expect(mocks.updateCheckpoint).not.toHaveBeenCalled();
  });

  it('releases lock even when an error occurs', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0);

    // getLatestLedger is wrapped in withRetry, so an always-failing RPC retries
    // (with backoff) before the run rejects. Drive the backoff timers.
    mocks.getLatestLedger.mockRejectedValue(new Error('rpc down'));

    const settled = runIndexer().catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await settled;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('rpc down');
    expect(mocks.db.rpc).toHaveBeenCalledWith(
      'release_indexer_lock',
      expect.objectContaining({ p_owner: expect.any(String) }),
    );
  });

  it('rejects a returned acquire error instead of reporting contention', async () => {
    (mocks.db.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null, error: { message: 'database unavailable', code: '08006' },
    });

    await expect(runIndexer()).rejects.toThrow('database unavailable');
    expect(mocks.getLatestLedger).not.toHaveBeenCalled();
    expect(mocks.updateCheckpoint).not.toHaveBeenCalled();
  });

  it('rejects an invalid acquisition result instead of claiming contention', async () => {
    (mocks.db.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    await expect(runIndexer()).rejects.toThrow('Invalid indexer lock acquisition result');
  });

  it('logs a returned release error while preserving committed results', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (mocks.db.rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      Promise.resolve(name === 'acquire_indexer_lock'
        ? { data: true, error: null }
        : { data: null, error: { message: 'release unavailable' } }),
    );

    const result = await runIndexer();

    expect(result.contracts.identity.lastLedger).toBe(20);
    const entries = (console.error as ReturnType<typeof vi.fn>).mock.calls.map(([line]) => JSON.parse(line));
    expect(entries).toContainEqual(expect.objectContaining({ error: 'release unavailable' }));
  });

  it('preserves the primary run failure when release also returns an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getCheckpointState.mockRejectedValue(new Error('checkpoint read failed'));
    (mocks.db.rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      Promise.resolve(name === 'acquire_indexer_lock'
        ? { data: true, error: null }
        : { data: null, error: { message: 'release unavailable' } }),
    );

    await expect(runIndexer()).rejects.toThrow('checkpoint read failed');
    const entries = (console.error as ReturnType<typeof vi.fn>).mock.calls.map(([line]) => JSON.parse(line));
    expect(entries).toContainEqual(expect.objectContaining({ error: 'release unavailable' }));
  });

  it('fences the lock: acquire and release use the same owner token', async () => {
    await runIndexer();

    const calls = (mocks.db.rpc as ReturnType<typeof vi.fn>).mock.calls;
    const acquire = calls.find(([name]) => name === 'acquire_indexer_lock');
    const release = calls.find(([name]) => name === 'release_indexer_lock');

    expect(acquire?.[1]?.p_owner).toEqual(expect.any(String));
    expect(release?.[1]?.p_owner).toBe(acquire?.[1]?.p_owner);
  });

  it('retains coverage for a recognized malformed event instead of silently dropping it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getCheckpointState.mockImplementation((_db: unknown, name: string) => Promise.resolve({
      lastLedger: name === 'identity' ? 10 : 20, expectedNext: null, deferAttempts: 7,
    }));
    mocks.parseIdentityEvent.mockReturnValue(null);
    mocks.getEvents.mockResolvedValue({
      events: [{ id: 'evt-bad', ledger: 15, topic: [nativeToScVal('registered', { type: 'symbol' })], inSuccessfulContractCall: true }],
      oldestLedger: 1,
    });

    const result = await runIndexer();

    expect(result.errors).toBe(1);
    expect(result.processed).toBe(0);
    expect(result.skippedEvents).toBe(0);
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(mocks.updateCheckpoint).toHaveBeenCalledWith(mocks.db, 'identity', 10, undefined, 7, false);
    expect(mocks.writeIdentityEvent).not.toHaveBeenCalled();
  });

  it('retains coverage when a later page is invalid after earlier writes succeeded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getCheckpointState.mockImplementation((_db: unknown, name: string) => Promise.resolve({
      lastLedger: name === 'identity' ? 10 : 20, expectedNext: null, deferAttempts: 0,
    }));
    mocks.parseIdentityEvent.mockImplementation((event) => event.id === 'good' ? { type: 'Registered' } : null);
    mocks.getEvents.mockImplementation((request) => Promise.resolve(request.limit === 1
      ? { events: [], oldestLedger: 1 }
      : {
        events: [{ id: request.cursor ? 'bad' : 'good', ledger: request.cursor ? 15 : 14,
          topic: [nativeToScVal('registered', { type: 'symbol' })], inSuccessfulContractCall: true }],
        cursor: request.cursor ? undefined : 'page-two', oldestLedger: 1,
      }));

    const result = await runIndexer();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(mocks.updateCheckpoint).toHaveBeenCalledWith(mocks.db, 'identity', 10, undefined, 0, false);
  });

  it('does not persist events from unsuccessful contract calls', async () => {
    mocks.getEvents.mockResolvedValue({
      events: [{ id: 'evt-failed', ledger: 15, topic: [nativeToScVal('registered', { type: 'symbol' })], inSuccessfulContractCall: false }],
      oldestLedger: 1,
    });
    mocks.parseIdentityEvent.mockReturnValue({ type: 'Registered' });

    const result = await runIndexer();

    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
    expect(mocks.writeIdentityEvent).not.toHaveBeenCalled();
    expect(mocks.writeReputationEvent).not.toHaveBeenCalled();
    expect(mocks.writeValidationEvent).not.toHaveBeenCalled();
  });

  it('ignores unrelated contract events when the parser returns null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    mocks.parseIdentityEvent.mockReturnValue(null);
    mocks.parseReputationEvent.mockReturnValue(null);
    mocks.parseValidationEvent.mockReturnValue(null);

    mocks.getEvents.mockResolvedValue({
      events: [
        { id: 'evt-1', ledger: 15, topic: [nativeToScVal('unrelated', { type: 'symbol' })], inSuccessfulContractCall: true },
      ],
      cursor: undefined,
    });

    const result = await runIndexer();

    expect(result.processed).toBe(0);
    expect(console.warn).toHaveBeenCalled();

    const warnCall = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const logEntry = JSON.parse(warnCall);
    expect(logEntry.msg).toBe('Ignored unrelated contract event');
    expect(logEntry.contract).toBe('identity');
  });
});
