import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TESTNET } from './config.js';
import { createRpcServer, withIndexerLease } from './runtime.js';

const config = { ...TESTNET, rpcUrl: 'http://127.0.0.1:1' };
const requests: string[] = [];
let releaseFails: boolean;
let acquireReply: unknown;
let network: string;
beforeEach(() => {
  requests.length = 0;
  releaseFails = false;
  acquireReply = true;
  network = TESTNET.networkPassphrase;
  vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      if (path.includes('/rest/')) {
        const name = path.split('/').pop()!;
        requests.push(name);
        return new Response(
          JSON.stringify(
            name === 'acquire_indexer_lease'
              ? acquireReply
              : releaseFails
                ? { message: 'release failed' }
                : null,
          ),
          {
            status: name === 'release_indexer_lock' && releaseFails ? 500 : 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      const request = JSON.parse(String(init?.body));
      requests.push(request.method);
      const result =
        request.method === 'getNetwork'
          ? { passphrase: network, protocolVersion: '29' }
          : request.method === 'getVersionInfo'
            ? { version: '29.0.0' }
            : { sequence: 100 };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('bounded runtime with the real SDK transport', () => {
  it('acquires only after RPC network/version checks and always releases successful work', async () => {
    const work = vi.fn(async () => 'done');
    expect(await withIndexerLease(config, 'live', {}, work)).toBe('done');
    expect(requests.slice(-2)).toEqual(['acquire_indexer_lease', 'release_indexer_lock']);
    expect(work).toHaveBeenCalledOnce();
  });
  it('cleans up its timer when client setup fails before acquisition', async () => {
    vi.useFakeTimers();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    await expect(withIndexerLease(config, 'live', {}, async () => 'never')).rejects.toThrow(
      /SUPABASE/,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects a mismatched RPC network before acquiring a lease', async () => {
    network = 'wrong';
    await expect(withIndexerLease(config, 'live', {}, async () => 'never')).rejects.toThrow(
      /network/,
    );
    expect(requests).not.toContain('acquire_indexer_lease');
  });
  it('distinguishes contention from malformed acquisition responses', async () => {
    acquireReply = false;
    expect(await withIndexerLease(config, 'live', {}, async () => 'never')).toBeNull();
    expect(requests).not.toContain('release_indexer_lock');
    acquireReply = null;
    await expect(withIndexerLease(config, 'live', {}, async () => 'never')).rejects.toThrow(
      /acquisition result/,
    );
  });
  it('preserves the primary failure and success when release itself returns an error', async () => {
    releaseFails = true;
    await expect(
      withIndexerLease(config, 'live', {}, async () => {
        throw new Error('primary');
      }),
    ).rejects.toThrow('primary');
    expect(await withIndexerLease(config, 'live', {}, async () => 'done')).toBe('done');
  });
  it('cancels an actual SDK request before acquisition when the run is interrupted', async () => {
    const controller = new AbortController();
    let sawAbort = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener(
              'abort',
              () => {
                sawAbort = true;
                reject(init.signal!.reason);
              },
              { once: true },
            );
          }),
      ),
    );
    const server = createRpcServer(config.rpcUrl, controller.signal);
    const pending = server.getNetwork();
    const rejected = expect(pending).rejects.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    controller.abort(new Error('interrupted'));
    await rejected;
    expect(sawAbort).toBe(true);
  });
  it('enforces the per-request timeout in SDK15 where the constructor timeout is ignored', async () => {
    vi.useFakeTimers();
    let sawAbort = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener(
              'abort',
              () => {
                sawAbort = true;
                reject(init.signal!.reason);
              },
              { once: true },
            );
          }),
      ),
    );
    const server = createRpcServer(config.rpcUrl, new AbortController().signal);
    const rejected = expect(server.getNetwork()).rejects.toThrow(/timeout/);
    await vi.advanceTimersByTimeAsync(10_001);
    await rejected;
    expect(sawAbort).toBe(true);
  });
});
