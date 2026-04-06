import { afterEach, describe, expect, it, vi } from 'vitest';
import { fundTestnet } from '../src/core/helpers.js';

describe('fundTestnet', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('calls Friendbot with the encoded address', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true
		});

		vi.stubGlobal('fetch', fetchMock);

		await fundTestnet('GABC123');

		expect(fetchMock).toHaveBeenCalledWith(
			'https://friendbot.stellar.org?addr=GABC123'
		);
	});

	it('throws a helpful error when Friendbot fails', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			text: async () => 'rate limited'
		});

		vi.stubGlobal('fetch', fetchMock);

		await expect(fundTestnet('GABC123')).rejects.toThrow(
			'Friendbot failed: 429 — rate limited'
		);
	});
});
