import { afterEach, describe, expect, it, vi } from 'vitest';
import { fundTestnet, validateTag, MAX_TAG_LENGTH } from '../src/core/helpers.js';

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

describe('validateTag', () => {
	it('accepts tags within limit', () => {
		expect(() => validateTag('starred')).not.toThrow();
		expect(() => validateTag('a'.repeat(MAX_TAG_LENGTH))).not.toThrow();
		expect(() => validateTag('')).not.toThrow();
	});

	it('rejects tags exceeding limit', () => {
		expect(() => validateTag('a'.repeat(MAX_TAG_LENGTH + 1))).toThrow(
			`Tag too long (${MAX_TAG_LENGTH + 1} chars, max ${MAX_TAG_LENGTH})`
		);
	});

	it('uses custom label in error message', () => {
		expect(() => validateTag('a'.repeat(MAX_TAG_LENGTH + 1), 'Tag 2')).toThrow(
			'Tag 2 too long'
		);
	});
});
