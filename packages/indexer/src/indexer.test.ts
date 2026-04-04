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
  },
  db: {} as Record<string, unknown>,
  serverCtor: vi.fn(),
  getLatestLedger: vi.fn(),
  getEvents: vi.fn(),
  createSupabaseAdmin: vi.fn(),
  getLastLedger: vi.fn(),
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
  getLastLedger: mocks.getLastLedger,
  updateCheckpoint: mocks.updateCheckpoint,
  refreshLeaderboard: mocks.refreshLeaderboard,
  writeIdentityEvent: mocks.writeIdentityEvent,
  writeReputationEvent: mocks.writeReputationEvent,
  writeValidationEvent: mocks.writeValidationEvent,
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
    mocks.getLastLedger.mockResolvedValue(10);
    mocks.getEvents.mockResolvedValue({ events: [], cursor: undefined });

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

  it('does not advance checkpoints when no events are processed', async () => {
    const result = await runIndexer();

    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.contracts.identity.lastLedger).toBe(10);
    expect(result.contracts.reputation.lastLedger).toBe(10);
    expect(result.contracts.validation.lastLedger).toBe(10);
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      10,
      undefined,
    );
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      2,
      mocks.db,
      'reputation',
      10,
      undefined,
    );
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      3,
      mocks.db,
      'validation',
      10,
      undefined,
    );
    expect(mocks.refreshLeaderboard).not.toHaveBeenCalled();
  });

  it('retries getEvents and succeeds on a later attempt', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0);

    mocks.getEvents
      .mockRejectedValueOnce(new Error('temporary rpc error'))
      .mockResolvedValue({ events: [], cursor: undefined });

    const promise = runIndexer();

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result.errors).toBe(0);
    expect(mocks.getEvents).toHaveBeenCalledTimes(4);
    expect(mocks.updateCheckpoint).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      'identity',
      10,
      undefined,
    );
  });

  it('returns skipped: true when lock cannot be acquired', async () => {
    (mocks.db.rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === 'acquire_indexer_lock') return Promise.resolve({ data: false });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await runIndexer();

    expect(result.skipped).toBe(true);
    expect(result.processed).toBe(0);
    expect(mocks.getLatestLedger).not.toHaveBeenCalled();
    expect(mocks.getEvents).not.toHaveBeenCalled();
  });

  it('releases lock even when an error occurs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.getLatestLedger.mockRejectedValue(new Error('rpc down'));

    await expect(runIndexer()).rejects.toThrow('rpc down');

    expect(mocks.db.rpc).toHaveBeenCalledWith('release_indexer_lock');
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
