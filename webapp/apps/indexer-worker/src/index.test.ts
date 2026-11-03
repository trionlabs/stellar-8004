import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IndexerResult } from '../../../packages/indexer/src/indexer.js';
import { pickRpc, runOnce } from './index.js';

const result = (skipped = false): IndexerResult => ({
	processed: 0,
	errors: 0,
	skippedEvents: 0,
	contracts: {},
	gaps: [],
	skipped,
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('runOnce', () => {
	it('refuses to run unless the network is mainnet', async () => {
		vi.stubEnv('STELLAR_NETWORK', '');
		const run = vi.fn();
		await expect(runOnce(run)).rejects.toThrow('expected mainnet');
		expect(run).not.toHaveBeenCalled();
	});

	it('runs once on mainnet', async () => {
		vi.stubEnv('STELLAR_NETWORK', 'mainnet');
		const run = vi.fn().mockResolvedValue(result());
		const wait = vi.fn();
		await runOnce(run, wait);
		expect(run).toHaveBeenCalledTimes(1);
		expect(wait).not.toHaveBeenCalled();
	});

	it('retries once when another writer holds the lock', async () => {
		vi.stubEnv('STELLAR_NETWORK', 'mainnet');
		const run = vi.fn().mockResolvedValueOnce(result(true)).mockResolvedValueOnce(result());
		const wait = vi.fn().mockResolvedValue(undefined);
		const out = await runOnce(run, wait);
		expect(run).toHaveBeenCalledTimes(2);
		expect(wait).toHaveBeenCalledWith(15_000);
		expect(out.skipped).toBe(false);
		// Both attempts share the first attempt's deadline.
		expect(run.mock.calls[0][0].deadlineMs).toBe(run.mock.calls[1][0].deadlineMs);
	});

	it('points the indexer at the RPC the probe picked', async () => {
		vi.stubEnv('STELLAR_NETWORK', 'mainnet');
		vi.stubEnv('STELLAR_MAINNET_RPC_PRIMARY_URL', 'https://primary.example');
		vi.stubEnv('STELLAR_MAINNET_RPC_FALLBACK_URL', 'https://fallback.example');
		vi.stubEnv('STELLAR_MAINNET_RPC_URL', '');
		const choose = vi.fn().mockResolvedValue('https://fallback.example');
		const run = vi.fn().mockResolvedValue(result());

		await runOnce(run, vi.fn(), choose);

		expect(choose).toHaveBeenCalledWith(['https://primary.example', 'https://fallback.example']);
		expect(process.env.STELLAR_MAINNET_RPC_URL).toBe('https://fallback.example');
	});
});

describe('pickRpc', () => {
	const health = (status: string) =>
		new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { status } }));

	it('returns the first healthy RPC', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(health('unhealthy'))
			.mockResolvedValueOnce(health('healthy'));
		await expect(pickRpc(['https://a', 'https://b'], fetchFn)).resolves.toBe('https://b');
	});

	it('falls back to the first RPC when none answers healthy', async () => {
		const fetchFn = vi.fn().mockRejectedValue(new Error('down'));
		await expect(pickRpc(['https://a', 'https://b'], fetchFn)).resolves.toBe('https://a');
	});
});
