const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
const STELLAR_BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// Version bytes from SEP-23 / StrKey:
// - Account ID (G...): 6 << 3 = 48
// - Contract  (C...): 2 << 3 = 16
const STELLAR_PUBLIC_KEY_VERSION_BYTE = 6 << 3;
const STELLAR_CONTRACT_VERSION_BYTE = 2 << 3;
const STELLAR_ADDRESS_DECODED_LENGTH = 35;

/**
 * Uint8Array/Buffer -> hex string conversion.
 * Works in both Node and Deno because Buffer extends Uint8Array.
 */
export function toHex(buf: unknown): string {
  if (buf == null) {
    return '';
  }

  if (buf instanceof Uint8Array) {
    return Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  if (typeof buf === 'string') {
    return /^[0-9a-fA-F]*$/.test(buf) ? buf.toLowerCase() : '';
  }

  return '';
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

/**
 * Validates that a string is a Stellar address - either an Ed25519 account ID
 * (G...) or a contract address (C...).
 *
 * Audit finding B2: this function used to reject contract addresses outright,
 * which silently dropped events from smart-wallet agents (passkey kits, MPC,
 * etc.). The contract code itself accepts any Address, so the parser must too.
 */
export function isValidStellarAddress(address: string): boolean {
  if (typeof address !== 'string' || address.length !== 56) return false;
  const first = address[0];
  if (first !== 'G' && first !== 'C') return false;

  try {
    const decoded = base32Decode(address);
    if (decoded.length !== STELLAR_ADDRESS_DECODED_LENGTH) return false;
    const expectedVersionByte =
      first === 'G' ? STELLAR_PUBLIC_KEY_VERSION_BYTE : STELLAR_CONTRACT_VERSION_BYTE;
    if (decoded[0] !== expectedVersionByte) return false;

    const payload = decoded.slice(0, 33);
    const checksum = decoded.slice(33);
    const expectedChecksum = crc16Xmodem(payload);

    return (
      checksum[0] === (expectedChecksum & 0xff) &&
      checksum[1] === ((expectedChecksum >> 8) & 0xff)
    );
  } catch {
    return false;
  }
}

function base32Decode(input: string): Uint8Array {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of input) {
    const index = STELLAR_BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new TypeError(`Invalid base32 character: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  if (bits > 0 && (value & ((1 << bits) - 1)) !== 0) {
    throw new TypeError('Invalid base32 trailing bits');
  }

  return Uint8Array.from(bytes);
}

function crc16Xmodem(data: Uint8Array): number {
  let crc = 0x0000;

  for (const byte of data) {
    crc ^= byte << 8;

    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }

      crc &= 0xffff;
    }
  }

  return crc;
}
