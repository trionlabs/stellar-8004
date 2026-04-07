import { describe, expect, it } from 'vitest';
import { validateAgentUri } from '../src/core/metadata.js';

describe('validateAgentUri', () => {
	it('accepts supported schemes', () => {
		expect(() => validateAgentUri('https://example.com')).not.toThrow();
		expect(() => validateAgentUri('ipfs://bafy123')).not.toThrow();
		expect(() =>
			validateAgentUri('data:application/json;base64,eyJ0eXBlIjoidGVzdCJ9')
		).not.toThrow();
	});

	it('rejects unsupported schemes', () => {
		expect(() => validateAgentUri('ftp://example.com')).toThrow(
			'Agent URI must use https://, http://, ipfs://, or data: scheme'
		);
	});

	it('rejects oversized uris', () => {
		const oversized = `https://example.com/${'a'.repeat(9000)}`;
		expect(() => validateAgentUri(oversized)).toThrow('Agent URI too large');
	});
});
