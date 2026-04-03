const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

/**
 * Uint8Array/Buffer -> hex string conversion.
 * Works in both Node and Deno because Buffer extends Uint8Array.
 */
export function toHex(buf: unknown): string {
  if (buf instanceof Uint8Array) {
    return Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  if (typeof buf === 'string') {
    if (!/^[0-9a-fA-F]*$/.test(buf)) {
      throw new TypeError(
        `toHex: string is not valid hex: "${buf.slice(0, 20)}${buf.length > 20 ? '...' : ''}"`,
      );
    }
    return buf.toLowerCase();
  }

  throw new TypeError(
    `toHex: expected Uint8Array or string, got ${typeof buf} (${String(buf)})`,
  );
}

/**
 * Decodes byte arrays as UTF-8 text. Invalid sequences are replaced.
 */
export function bytesToUtf8(buf: unknown): string {
  if (buf instanceof Uint8Array) {
    return utf8Decoder.decode(buf);
  }

  if (typeof buf === 'string') return buf;

  throw new TypeError(
    `bytesToUtf8: expected Uint8Array or string, got ${typeof buf}`,
  );
}

/**
 * Converts event payloads into a safe object shape.
 * scValToNative(scvVoid) returns null, which would crash property access.
 */
export function parseEventData(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return {};
}

/**
 * Safely converts numeric event values into bigint.
 */
export function toBigInt(val: unknown, fieldName: string): bigint {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(val);

  throw new TypeError(
    `toBigInt: expected bigint/number for ${fieldName}, got ${typeof val}`,
  );
}
