import { describe, expect, it } from 'vitest';
import { handle, SECURITY_HEADERS } from './hooks.server.js';

describe('handle', () => {
	it('adds the security headers without overriding ones a route set', async () => {
		const response = await handle({
			event: {} as never,
			resolve: async () => new Response('ok', { headers: { 'Referrer-Policy': 'no-referrer' } })
		});
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			if (name !== 'Referrer-Policy') expect(response.headers.get(name)).toBe(value);
		}
		expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
		expect(response.headers.has('X-Build')).toBe(false);
	});

	it('names the deployed build, preferring the git tag over the version id', async () => {
		const run = (tag: string) =>
			handle({
				event: {
					platform: { env: { CF_VERSION_METADATA: { id: 'v-1', tag, timestamp: '' } } }
				} as never,
				resolve: async () => new Response('ok')
			});
		expect((await run('abc1234')).headers.get('X-Build')).toBe('abc1234');
		expect((await run('')).headers.get('X-Build')).toBe('v-1');
	});
});
