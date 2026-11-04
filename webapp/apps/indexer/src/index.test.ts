import { Networks } from '@stellar/stellar-sdk';
import { createTestD1, type TestD1 } from '@stellar8004/d1/test-db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAINNET_CONFIG } from '../../../packages/indexer/src/sdk-config.js';
import { pickRpc, runOnce, type Env } from './index.js';
import { account, ev, fakeRpc, rows, seedCheckpoints } from './test-helpers.js';

let db: TestD1;
let env: Env;
beforeEach(() => {
	db = createTestD1();
	env = {
		DB: db,
		STELLAR_NETWORK: 'mainnet',
		STELLAR_MAINNET_RPC_PRIMARY_URL: 'https://primary.example',
		STELLAR_MAINNET_RPC_FALLBACK_URL: 'https://fallback.example'
	};
});
afterEach(() => {
	vi.unstubAllGlobals();
});

const removeFence = () => db.prepare("DELETE FROM indexer_locks WHERE owner = 'copy-fence'").run();
const locks = () => rows(db, 'SELECT owner FROM indexer_locks');

describe('runOnce', () => {
	it('refuses to run unless STELLAR_NETWORK is mainnet', async () => {
		const connect = vi.fn();
		await expect(runOnce({ ...env, STELLAR_NETWORK: undefined }, connect)).rejects.toThrow(
			/expected "mainnet"/
		);
		expect(connect).not.toHaveBeenCalled();
	});

	it('does nothing while the copy fence holds the lock', async () => {
		const connect = vi.fn();
		const choose = vi.fn();
		await expect(runOnce(env, connect, choose)).resolves.toEqual({ skipped: true });
		expect(connect).not.toHaveBeenCalled();
		expect(choose).not.toHaveBeenCalled();
		expect(await locks()).toEqual([{ owner: 'copy-fence' }]);
	});

	it('indexes, then resolves URIs under the lock, and releases it', async () => {
		await removeFence();
		await seedCheckpoints(db, 99);
		const registered = {
			...ev.registered(100, 1, account()),
			contractId: MAINNET_CONFIG.contracts.identity
		} as never;
		const server = fakeRpc([registered], { latest: 110 });
		const connect = vi.fn(() => server);
		const choose = vi.fn(async (urls: string[]) => urls[1]);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ name: 'Agent One' })))
		);

		const result = await runOnce(env, connect, choose);

		expect(choose).toHaveBeenCalledWith(['https://primary.example', 'https://fallback.example']);
		expect(connect).toHaveBeenCalledWith('https://fallback.example');
		expect(result).toMatchObject({
			skipped: false,
			contracts: { identity: { lastLedger: 110, processed: 1 } },
			resolve: { resolved: 1 }
		});
		expect(await rows(db, 'SELECT agent_uri_data FROM agents')).toEqual([
			{ agent_uri_data: '{"name":"Agent One"}' }
		]);
		expect(await locks()).toEqual([]);
	});

	it('refuses an RPC that serves another network, and still releases the lock', async () => {
		await removeFence();
		await seedCheckpoints(db, 99);
		const server = {
			...fakeRpc([], { latest: 110 }),
			getNetwork: async () => ({ passphrase: Networks.TESTNET, protocolVersion: '23' })
		};
		await expect(
			runOnce(
				env,
				() => server,
				async (urls) => urls[0]
			)
		).rejects.toThrow(/expected mainnet/);
		expect(server.requests).toEqual([]);
		expect(await locks()).toEqual([]);
	});
});

describe('pickRpc', () => {
	const health = (status: string) =>
		new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { status } }));

	it('returns the first RPC that reports healthy', async () => {
		const fetchFn = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(health('unhealthy'))
			.mockResolvedValueOnce(health('healthy'));
		await expect(pickRpc(['https://a.example', 'https://b.example'], fetchFn)).resolves.toBe(
			'https://b.example'
		);
		expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toMatchObject({
			method: 'getHealth'
		});
	});

	it('falls back to the first RPC when none answers healthy', async () => {
		const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('down'));
		await expect(pickRpc(['https://a.example', 'https://b.example'], fetchFn)).resolves.toBe(
			'https://a.example'
		);
	});
});
