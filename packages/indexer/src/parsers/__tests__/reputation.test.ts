import { Address } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { parseReputationEvent } from '../reputation.js';
import { mockEvent } from './helpers.js';

const MOCK_CLIENT = new Address(
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
);
const MOCK_CLIENT_STR = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const MOCK_RESPONDER = new Address(
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
);

describe('parseReputationEvent', () => {
  it('parses NewFeedback events with i128 values', () => {
    const event = mockEvent({
      topics: ['new_feedback', 1, MOCK_CLIENT],
      data: {
        feedback_index: 1n,
        value: 85n,
        value_decimals: 0,
        tag1: 'starred',
        tag2: '',
        endpoint: 'https://agent.example.com',
        feedback_uri: 'ipfs://QmFeedback',
        feedback_hash: new Uint8Array(32).fill(0xab),
      },
      typeHints: { value: 'i128', feedback_index: 'u64' },
    });

    const result = parseReputationEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'NewFeedback',
        agentId: 1,
        clientAddress: MOCK_CLIENT_STR,
        feedbackIndex: 1n,
        value: 85n,
        valueDecimals: 0,
        tag1: 'starred',
        feedbackHash: 'ab'.repeat(32),
      }),
    );
  });

  it('parses NewFeedback events with negative i128 values', () => {
    const event = mockEvent({
      topics: ['new_feedback', 2, MOCK_CLIENT],
      data: {
        feedback_index: 1n,
        value: -50n,
        value_decimals: 2,
        tag1: '',
        tag2: '',
        endpoint: '',
        feedback_uri: '',
        feedback_hash: new Uint8Array(32),
      },
      typeHints: { value: 'i128', feedback_index: 'u64' },
    });

    const result = parseReputationEvent(event);

    expect(result?.type).toBe('NewFeedback');
    expect(result && 'value' in result ? result.value : undefined).toBe(-50n);
  });

  it('parses FeedbackRevoked events', () => {
    const event = mockEvent({
      topics: ['feedback_revoked', 1, MOCK_CLIENT],
      data: { feedback_index: 3n },
      typeHints: { feedback_index: 'u64' },
    });

    const result = parseReputationEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'FeedbackRevoked',
        agentId: 1,
        clientAddress: MOCK_CLIENT_STR,
        feedbackIndex: 3n,
      }),
    );
  });

  it("reads ResponseAppended.clientAddress from topic[2]", () => {
    const event = mockEvent({
      topics: ['response_appended', 1, MOCK_CLIENT],
      data: {
        responder: MOCK_RESPONDER,
        feedback_index: 1n,
        response_uri: 'ipfs://QmResponse',
        response_hash: new Uint8Array(32).fill(0xcd),
      },
      typeHints: { feedback_index: 'u64' },
    });

    const result = parseReputationEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'ResponseAppended',
        agentId: 1,
        clientAddress: MOCK_CLIENT_STR,
        feedbackIndex: 1n,
        responseHash: 'cd'.repeat(32),
      }),
    );
    expect(result).not.toHaveProperty('responseIndex');
  });

  it('returns null for too-short topic lists', () => {
    const event = mockEvent({ topics: ['new_feedback', 1] });

    expect(parseReputationEvent(event)).toBeNull();
  });
});
