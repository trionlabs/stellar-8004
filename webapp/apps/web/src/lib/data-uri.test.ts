import { describe, expect, it } from 'vitest';
import { dataUriBytes } from './data-uri.js';

const text = (bytes: Uint8Array | null) => (bytes ? new TextDecoder().decode(bytes) : null);

describe('dataUriBytes', () => {
	it('decodes base64 and percent-encoded data URIs to their exact bytes', () => {
		const json = '{"score":90,"note":"çok iyi"}';
		const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
		expect(text(dataUriBytes(`data:application/json;base64,${b64}`))).toBe(json);
		expect(text(dataUriBytes(`data:application/json,${encodeURIComponent(json)}`))).toBe(json);
		expect(text(dataUriBytes('data:,hello'))).toBe('hello');
	});

	it('rejects anything that is not a well-formed data URI, and oversized payloads', () => {
		expect(dataUriBytes('ipfs://bafy')).toBeNull();
		expect(dataUriBytes('data:application/json;base64,@@@')).toBeNull();
		expect(dataUriBytes('data:text/plain,%E0%A4%A')).toBeNull();
		expect(dataUriBytes(`data:,${'a'.repeat(1_048_577)}`)).toBeNull();
	});
});
