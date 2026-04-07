import { Address } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { parseIdentityEvent } from '../identity.js';
import { mockEvent } from './helpers.js';

const MOCK_OWNER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const textEncoder = new TextEncoder();

describe('parseIdentityEvent', () => {
  it('parses Registered events', () => {
    const event = mockEvent({
      topics: ['registered', 1, new Address(MOCK_OWNER)],
      data: { agent_uri: 'https://example.com/agent.json' },
    });

    const result = parseIdentityEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'Registered',
        agentId: 1,
        owner: MOCK_OWNER,
        agentUri: 'https://example.com/agent.json',
        txHash: 'a'.repeat(64),
      }),
    );
  });

  it('parses Registered events with an empty URI', () => {
    const event = mockEvent({
      topics: ['registered', 5, new Address(MOCK_OWNER)],
      data: { agent_uri: '' },
    });

    const result = parseIdentityEvent(event);

    expect(result?.type).toBe('Registered');
    expect(result && 'agentUri' in result ? result.agentUri : undefined).toBe('');
  });

  it('returns null when Registered topics are incomplete', () => {
    const event = mockEvent({
      topics: ['registered', 1],
      data: { agent_uri: '' },
    });

    expect(parseIdentityEvent(event)).toBeNull();
  });

  it('parses UriUpdated events', () => {
    const event = mockEvent({
      topics: ['uri_updated', 1, new Address(MOCK_OWNER)],
      data: { new_uri: 'ipfs://QmNew' },
    });

    const result = parseIdentityEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'UriUpdated',
        agentId: 1,
        updatedBy: MOCK_OWNER,
        newUri: 'ipfs://QmNew',
      }),
    );
  });

  it('parses MetadataSet events', () => {
    const event = mockEvent({
      topics: ['metadata_set', 1],
      data: { key: 'category', value: textEncoder.encode('defi') },
    });

    const result = parseIdentityEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'MetadataSet',
        agentId: 1,
        key: 'category',
        value: 'defi',
      }),
    );
  });

  it('parses WalletSet events', () => {
    const event = mockEvent({
      topics: ['wallet_set', 1],
      data: { wallet: new Address(MOCK_OWNER) },
    });

    const result = parseIdentityEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'WalletSet',
        agentId: 1,
        wallet: MOCK_OWNER,
      }),
    );
  });

  it('parses WalletRemoved events with void data', () => {
    const event = mockEvent({
      topics: ['wallet_removed', 1],
    });

    const result = parseIdentityEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'WalletRemoved',
        agentId: 1,
      }),
    );
  });

  it('returns null for unknown events', () => {
    const event = mockEvent({ topics: ['unknown_event', 1] });

    expect(parseIdentityEvent(event)).toBeNull();
  });

  it('returns null for too-short topic lists', () => {
    const event = mockEvent({ topics: ['registered'] });

    expect(parseIdentityEvent(event)).toBeNull();
  });

  it('returns null without throwing when topic[0] is not a symbol', () => {
    // Manually craft an event with a malformed first topic that
    // scValToNative will choke on. The parser must catch and return null
    // rather than crash the indexer's batch processing.
    const event = mockEvent({ topics: ['registered', 1, MOCK_OWNER] });
    // Replace the first topic with a structurally invalid ScVal that
    // scValToNative cannot interpret as a symbol. We use an ScVal with
    // an unrecognized type tag by reaching into the SDK.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event.topic as unknown[])[0] = { switch: () => ({ value: -1 }) } as any;

    expect(() => parseIdentityEvent(event)).not.toThrow();
    expect(parseIdentityEvent(event)).toBeNull();
  });
});
