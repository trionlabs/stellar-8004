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
	});
});
