import { Address } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { parseValidationEvent } from '../validation.js';
import { mockEvent } from './helpers.js';

const MOCK_VALIDATOR = new Address(
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
);
const MOCK_VALIDATOR_STR = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('parseValidationEvent', () => {
  it('parses ValidationRequest events with request_hash as topic[3]', () => {
    // Spec compliance pass: renamed from `validation_requested` to
    // `validation_request` (no past-tense suffix) and `request_hash` is
    // now an indexed topic at index 3.
    const event = mockEvent({
      topics: [
        'validation_request',
        MOCK_VALIDATOR,
        1,
        new Uint8Array(32).fill(0xff),
      ],
      data: {
        request_uri: 'https://example.com/validation',
      },
    });

    const result = parseValidationEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'ValidationRequest',
        validatorAddress: MOCK_VALIDATOR_STR,
        agentId: 1,
        requestHash: 'ff'.repeat(32),
        requestUri: 'https://example.com/validation',
      }),
    );
  });

  it('parses ValidationResponse events with request_hash as topic[3]', () => {
    // Spec compliance pass: renamed from `validation_responded`.
    const event = mockEvent({
      topics: [
        'validation_response',
        MOCK_VALIDATOR,
        1,
        new Uint8Array(32).fill(0xee),
      ],
      data: {
        response: 95,
        response_uri: 'ipfs://QmValidation',
        response_hash: new Uint8Array(32).fill(0xdd),
        tag: 'security',
      },
    });

    const result = parseValidationEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'ValidationResponse',
        validatorAddress: MOCK_VALIDATOR_STR,
        agentId: 1,
        requestHash: 'ee'.repeat(32),
        response: 95,
        tag: 'security',
      }),
    );
  });

  it('returns null when ValidationResponse is missing response', () => {
    // Was a throw before; now wrapped in the outer try/catch so a malformed
    // event from the RPC cannot crash the indexer's per-batch processing.
    const event = mockEvent({
      topics: [
        'validation_response',
        MOCK_VALIDATOR,
        1,
        new Uint8Array(32).fill(0xee),
      ],
      data: {
        response_uri: '',
        response_hash: new Uint8Array(32),
        tag: '',
      },
    });

    expect(parseValidationEvent(event)).toBeNull();
  });

  it('returns null for too-short topic lists', () => {
    // request_hash is now mandatory at index 3.
    const event = mockEvent({
      topics: ['validation_request', MOCK_VALIDATOR, 1],
    });

    expect(parseValidationEvent(event)).toBeNull();
  });

  it('returns null for unknown events', () => {
    const event = mockEvent({
      topics: [
        'some_other_event',
        MOCK_VALIDATOR,
        1,
        new Uint8Array(32).fill(0xff),
      ],
    });

    expect(parseValidationEvent(event)).toBeNull();
  });
});
