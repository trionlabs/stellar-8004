import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_STELLAR_NETWORK: 'mainnet',
		PUBLIC_STELLAR_RPC_URL: ' https://primary.example , https://fallback.example ,'
	}
}));

const { rpcUrls, selectHealthyRpc, stellarConfig } = await import('./sdk-client.js');

const reply = (status: string) =>
	new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { status } }));

describe('RPC failover', () => {
	it('reads an ordered, comma-separated RPC list and starts on the first', () => {
		expect(rpcUrls).toEqual(['https://primary.example', 'https://fallback.example']);
		expect(stellarConfig.rpcUrl).toBe('https://primary.example');
	});

	it('moves to the next RPC when the preferred one is down or unhealthy, and back when it recovers', async () => {
		const down = vi.fn(async (url: string | URL | Request) => {
			if (String(url).includes('primary')) throw new TypeError('fetch failed');
			return reply('healthy');
		});
		expect(await selectHealthyRpc(rpcUrls, down as typeof fetch)).toBe('https://fallback.example');
		expect(stellarConfig.rpcUrl).toBe('https://fallback.example');

		const unhealthy = vi.fn(async (url: string | URL | Request) =>
			reply(String(url).includes('primary') ? 'unhealthy' : 'healthy')
		);
		expect(await selectHealthyRpc(rpcUrls, unhealthy as typeof fetch)).toBe(
			'https://fallback.example'
		);

		const recovered = vi.fn(async () => reply('healthy'));
		expect(await selectHealthyRpc(rpcUrls, recovered as typeof fetch)).toBe(
			'https://primary.example'
		);
	});

	it('keeps the current RPC when none answers healthy', async () => {
		const none = vi.fn(async () => new Response('bad gateway', { status: 502 }));
		expect(await selectHealthyRpc(rpcUrls, none as typeof fetch)).toBe('https://primary.example');
		expect(none).toHaveBeenCalledTimes(2);
	});
});
