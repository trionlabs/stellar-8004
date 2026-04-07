import { describe, expect, it } from 'vitest';

import { isValidStellarAddress } from './helpers.js';

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
    // Audit finding B2: contract addresses must be accepted so smart-wallet
    // agents do not get silently dropped by the indexer parsers.
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
