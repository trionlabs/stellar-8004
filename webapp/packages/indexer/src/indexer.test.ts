import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  refreshLeaderboard: vi.fn(),
  writeIdentityEvent: vi.fn(),
  writeReputationEvent: vi.fn(),
  writeValidationEvent: vi.fn(),
  parseIdentityEvent: vi.fn(),
  parseReputationEvent: vi.fn(),
  parseValidationEvent: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: mocks.serverCtor,
  },
}));

vi.mock('./config.js', () => ({
  getConfig: vi.fn(() => mocks.config),
}));

vi.mock('./db.js', () => ({
  createSupabaseAdmin: mocks.createSupabaseAdmin,
  getCheckpointState: mocks.getCheckpointState,
  updateCheckpoint: mocks.updateCheckpoint,
  refreshLeaderboard: mocks.refreshLeaderboard,
  writeIdentityEvent: mocks.writeIdentityEvent,
  writeReputationEvent: mocks.writeReputationEvent,
  writeValidationEvent: mocks.writeValidationEvent,
  isRetryableWriteError: (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { retryable?: boolean }).retryable === true,
}));

vi.mock('./parsers/identity.js', () => ({
  parseIdentityEvent: mocks.parseIdentityEvent,
}));

vi.mock('./parsers/reputation.js', () => ({
  parseReputationEvent: mocks.parseReputationEvent,
}));

vi.mock('./parsers/validation.js', () => ({
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
    );
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      2,
      mocks.db,
      'reputation',
      20,
      21,
      0,
    );
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      3,
      mocks.db,
      'validation',
      20,
      21,
      0,
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
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      10,
      undefined,
      1,
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
    );

    const warnings = (console.warn as ReturnType<typeof vi.fn>).mock.calls.map(
      ([line]) => JSON.parse(line).msg,
    );
    expect(warnings).toContain('Retryable write failure - deferring batch to next run');
  });

  it('skips the event and advances once defer attempts exceed the max', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // identity has already been deferred too many times; reputation/validation
    // are caught up. The escape hatch should skip the failing event so the
    // checkpoint advances instead of deferring forever.
    mocks.getCheckpointState.mockImplementation((_db: unknown, contractName: string) =>
      Promise.resolve({
        lastLedger: contractName === 'identity' ? 10 : 20,
        expectedNext: null,
        deferAttempts: contractName === 'identity' ? 5 : 0,
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

    expect(result.errors).toBe(1);
    expect(result.skippedEvents).toBe(1);
    // Scan is treated as complete: the checkpoint advances past the bad event
    // and the defer counter resets to 0.
    expect(result.contracts.identity.lastLedger).toBe(20);
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      20,
      21,
      0,
    );

    const errors = (console.error as ReturnType<typeof vi.fn>).mock.calls.map(
      ([line]) => JSON.parse(line).msg,
    );
    expect(errors).toContain(
      'Retryable write failure exceeded max defer attempts - skipping event',
    );
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
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.getLatestLedger.mockRejectedValue(new Error('rpc down'));

    await expect(runIndexer()).rejects.toThrow('rpc down');

    expect(mocks.db.rpc).toHaveBeenCalledWith(
      'release_indexer_lock',
      expect.objectContaining({ p_owner: expect.any(String) }),
    );
  });

  it('fences the lock: acquire and release use the same owner token', async () => {
    await runIndexer();

    const calls = (mocks.db.rpc as ReturnType<typeof vi.fn>).mock.calls;
    const acquire = calls.find(([name]) => name === 'acquire_indexer_lock');
    const release = calls.find(([name]) => name === 'release_indexer_lock');

    expect(acquire?.[1]?.p_owner).toEqual(expect.any(String));
    expect(release?.[1]?.p_owner).toBe(acquire?.[1]?.p_owner);
  });

  it('logs a warning when parser returns null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    mocks.parseIdentityEvent.mockReturnValue(null);
    mocks.parseReputationEvent.mockReturnValue(null);
    mocks.parseValidationEvent.mockReturnValue(null);

    mocks.getEvents.mockResolvedValue({
      events: [
        { id: 'evt-1', ledger: 15, topic: ['t1'], inSuccessfulContractCall: true },
      ],
      cursor: undefined,
    });

    const result = await runIndexer();

    expect(result.processed).toBe(0);
    expect(console.warn).toHaveBeenCalled();

    const warnCall = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const logEntry = JSON.parse(warnCall);
    expect(logEntry.msg).toBe('Skipped unparseable event');
    expect(logEntry.contract).toBe('identity');
  });
});
