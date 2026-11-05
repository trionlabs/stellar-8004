const MAX_BYTES = 1_048_576;

/**
 * Bytes of a `data:` URI (RFC 2397), base64 or percent-encoded, or null when it is not a
 * well-formed data URI or decodes to more than 1 MiB. Feedback evidence is often inlined
 * this way (the SDK's toDataUri writes it), and its hash is checked against these bytes.
 */
export function dataUriBytes(uri: string): Uint8Array | null {
	const match = /^data:([^,]*),(.*)$/s.exec(uri);
	if (!match) return null;
	const [, meta, payload] = match;
	try {
		let bytes: Uint8Array;
		if (/;base64$/i.test(meta)) {
			const binary = atob(payload.replace(/\s+/g, ''));
			bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		} else {
			bytes = new TextEncoder().encode(decodeURIComponent(payload));
		}
		return bytes.byteLength > MAX_BYTES ? null : bytes;
	} catch {
		return null;
	}
}
