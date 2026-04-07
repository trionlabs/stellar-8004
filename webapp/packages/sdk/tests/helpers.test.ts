import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	fundTestnet,
	validateTag,
	MAX_TAG_LENGTH,
	validateStellarAddress,
	formatSorobanError,
	generateRequestNonce
} from '../src/core/helpers.js';

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
			'Friendbot failed: 429 - rate limited'
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

describe('validateStellarAddress', () => {
	it('accepts a valid ed25519 public key', () => {
		expect(() => validateStellarAddress('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7')).not.toThrow();
	});

	it('rejects an invalid address', () => {
		expect(() => validateStellarAddress('not-an-address')).toThrow('Address is not a valid Stellar address');
	});

	it('accepts a contract address (C...)', () => {
		// Smart-contract wallets (passkey kits, custom MPC, Lobstr smart accounts)
		// use C-addresses and must be accepted as valid agent owners or wallets.
		expect(() =>
			validateStellarAddress('CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ')
		).not.toThrow();
	});

	it('rejects empty string', () => {
		expect(() => validateStellarAddress('')).toThrow('is not a valid Stellar address');
	});

	it('uses custom label', () => {
		expect(() => validateStellarAddress('bad', 'Validator')).toThrow('Validator is not a valid Stellar address');
	});
});

describe('formatSorobanError', () => {
	it('returns friendly message for user declined', () => {
		expect(formatSorobanError(new Error('User declined the transaction'))).toBe('Transaction cancelled in wallet.');
	});

	it('returns friendly message for budget exceeded', () => {
		expect(formatSorobanError(new Error('HostError(Budget, LimitExceeded)'))).toBe(
			'Transaction resource limit exceeded. Try a simpler operation.'
		);
	});

	it('returns friendly message for network mismatch', () => {
		expect(formatSorobanError(new Error('network mismatch detected'))).toBe(
			'Wallet is on a different network than the app.'
		);
	});

	it('returns friendly message for timeout', () => {
		expect(formatSorobanError(new Error('ETIMEDOUT'))).toBe('Network timeout. Check your connection and try again.');
	});

	it('truncates long unknown errors and points at the console', () => {
		const longMsg = 'x'.repeat(300);
		const result = formatSorobanError(new Error(longMsg));
		// 200 chars of payload + the "...(see console for full error)" suffix.
		expect(result.length).toBeGreaterThan(200);
		expect(result.startsWith('x'.repeat(200))).toBe(true);
		expect(result).toContain('see console for full error');
	});

	it('passes through short unknown errors as-is', () => {
		expect(formatSorobanError(new Error('Something broke'))).toBe('Something broke');
	});

	it('handles non-Error values', () => {
		expect(formatSorobanError('raw string error')).toBe('raw string error');
	});
});

describe('generateRequestNonce', () => {
	it('returns a 32-byte hash by default', async () => {
		const nonce = await generateRequestNonce(
			1,
			'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7'
		);
		expect(nonce).toBeInstanceOf(Uint8Array);
		expect(nonce.length).toBe(32);
	});

	it('uses caller-supplied content hash when provided', async () => {
		const supplied = new Uint8Array(32);
		for (let i = 0; i < 32; i++) supplied[i] = i;
		const nonce = await generateRequestNonce(
			1,
			'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
			supplied
		);
		expect(nonce).toBe(supplied);
	});

	it('rejects content hashes with the wrong length', async () => {
		const tooShort = new Uint8Array(16);
		await expect(
			generateRequestNonce(
				1,
				'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
				tooShort
			)
		).rejects.toThrow('contentHash must be 32 bytes');
	});

	it('returns distinct nonces for back-to-back calls in default mode', async () => {
		const a = await generateRequestNonce(
			1,
			'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7'
		);
		const b = await generateRequestNonce(
			1,
			'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7'
		);
		expect(Array.from(a)).not.toEqual(Array.from(b));
	});
});
