import { Address } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { parseValidationEvent } from '../validation.js';
import { mockEvent } from './helpers.js';

const MOCK_VALIDATOR = new Address(
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
);
const MOCK_VALIDATOR_STR = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('parseValidationEvent', () => {
  it('parses ValidationRequested events with validator first in topics', () => {
    const event = mockEvent({
      topics: ['validation_requested', MOCK_VALIDATOR, 1],
      data: {
        request_hash: new Uint8Array(32).fill(0xff),
        request_uri: 'https://example.com/validation',
      },
    });

    const result = parseValidationEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'ValidationRequested',
        validatorAddress: MOCK_VALIDATOR_STR,
        agentId: 1,
        requestHash: 'ff'.repeat(32),
        requestUri: 'https://example.com/validation',
      }),
    );
  });

  it('parses ValidationResponded events', () => {
    const event = mockEvent({
      topics: ['validation_responded', MOCK_VALIDATOR, 1],
      data: {
        request_hash: new Uint8Array(32).fill(0xee),
        response: 95,
        response_uri: 'ipfs://QmValidation',
        response_hash: new Uint8Array(32).fill(0xdd),
        tag: 'security',
      },
    });

    const result = parseValidationEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'ValidationResponded',
        validatorAddress: MOCK_VALIDATOR_STR,
        agentId: 1,
        requestHash: 'ee'.repeat(32),
        response: 95,
        tag: 'security',
      }),
    );
  });

  it('returns null when ValidationResponded is missing response', () => {
    // Was a throw before; now wrapped in the outer try/catch so a malformed
    // event from the RPC cannot crash the indexer's per-batch processing.
    const event = mockEvent({
      topics: ['validation_responded', MOCK_VALIDATOR, 1],
      data: {
        request_hash: new Uint8Array(32).fill(0xee),
        response_uri: '',
        response_hash: new Uint8Array(32),
        tag: '',
      },
    });

    expect(parseValidationEvent(event)).toBeNull();
  });

  it('returns null for unknown events', () => {
    const event = mockEvent({
      topics: ['some_other_event', MOCK_VALIDATOR, 1],
    });

    expect(parseValidationEvent(event)).toBeNull();
  });
});
