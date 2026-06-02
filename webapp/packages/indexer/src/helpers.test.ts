import { describe, expect, it } from 'vitest';

import { isValidStellarAddress, toBigInt, toText } from './helpers.js';

describe('toText', () => {
  it('returns strings unchanged', () => {
    expect(toText('https://example.com')).toBe('https://example.com');
  });

  it('returns empty string for null/undefined', () => {
    expect(toText(null)).toBe('');
    expect(toText(undefined)).toBe('');
  });

  it('UTF-8 decodes a Uint8Array instead of comma-joining bytes', () => {
    // The bug guard: String(new Uint8Array([104,105])) === "104,105".
    const bytes = new TextEncoder().encode('hi');
    expect(toText(bytes)).toBe('hi');
    expect(toText(bytes)).not.toBe('104,105');
  });
});

describe('toBigInt', () => {
  it('passes a bigint through unchanged', () => {
    expect(toBigInt(5n, 'value')).toBe(5n);
  });

  it('converts an integer number to bigint', () => {
    expect(toBigInt(42, 'value')).toBe(42n);
  });

  it('rejects a non-integer number with a clear error', () => {
    // BigInt(1.5) throws an opaque RangeError; toBigInt must reject explicitly.
    expect(() => toBigInt(1.5, 'score')).toThrow(/expected an integer for score/);
  });

  it('rejects a non-numeric type with a clear error', () => {
    expect(() => toBigInt('7', 'score')).toThrow(/expected bigint\/number for score/);
  });
});

describe('isValidStellarAddress', () => {
  it('accepts a real ed25519 account address (G...)', () => {
    // Stellar Friendbot
    expect(
      isValidStellarAddress(
        'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
      ),
    ).toBe(true);
  });

  it('accepts the deployed identity-registry contract address (C...)', () => {
    expect(
      isValidStellarAddress(
        'CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ',
      ),
    ).toBe(true);
  });

  it('rejects a malformed string', () => {
    expect(isValidStellarAddress('not-an-address')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidStellarAddress('')).toBe(false);
  });

  it('rejects an address with the wrong length', () => {
    expect(isValidStellarAddress('GAAZI4TCR3TY5OJHCTJC2A4QSY6')).toBe(false);
  });

  it('rejects an address with the wrong first character', () => {
    expect(
      isValidStellarAddress(
        'SAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
      ),
    ).toBe(false);
  });

  it('rejects an address with a corrupted checksum', () => {
    expect(
      isValidStellarAddress(
        'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWAA',
      ),
    ).toBe(false);
  });
});
