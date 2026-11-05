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
  it('parses NewFeedback events with tag1 as topic[3]', () => {
    // Spec compliance pass: `tag1` is now an indexed topic so subscribers
    // can filter by tag on-chain.
    const event = mockEvent({
      topics: ['new_feedback', 1, MOCK_CLIENT, 'starred'],
      data: {
        feedback_index: 1n,
        value: 85n,
        value_decimals: 0,
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
      topics: ['new_feedback', 2, MOCK_CLIENT, ''],
      data: {
        feedback_index: 1n,
        value: -50n,
        value_decimals: 2,
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

  it('parses FeedbackRevoked events with feedback_index as topic[3]', () => {
    // Spec compliance pass: feedback_index is now an indexed topic and the
    // event body is empty (all three fields are topics).
    const event = mockEvent({
      topics: ['feedback_revoked', 1, MOCK_CLIENT, 3n],
      topicTypeHints: { 3: 'u64' },
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

  it('parses ResponseAppended with responder as topic[3]', () => {
    // Spec compliance pass: `responder` is now an indexed topic so off-chain
    // consumers can filter by responder identity on-chain.
    const event = mockEvent({
      topics: ['response_appended', 1, MOCK_CLIENT, MOCK_RESPONDER],
      data: {
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

  it('returns null when ResponseAppended topics are too short to carry responder', () => {
    // Topic length must be >= 4 now that responder is at index 3.
    const event = mockEvent({
      topics: ['response_appended', 1, MOCK_CLIENT],
      data: {
        feedback_index: 1n,
        response_uri: '',
        response_hash: new Uint8Array(32),
      },
      typeHints: { feedback_index: 'u64' },
    });

    expect(parseReputationEvent(event)).toBeNull();
  });

  it('returns null for too-short topic lists', () => {
    const event = mockEvent({ topics: ['new_feedback', 1] });

    expect(parseReputationEvent(event)).toBeNull();
  });
});
