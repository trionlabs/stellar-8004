import { Address } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { parseIdentityEvent } from '../identity.js';
import { mockEvent } from './helpers.js';

const MOCK_OWNER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
// A second valid (checksum-correct) account id, distinct from MOCK_OWNER.
const MOCK_RECIPIENT = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';
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

  it('parses MetadataSet events with key as topic', () => {
    // Spec parity (canonical erc-8004): `key` is an indexed topic at
    // index 2. The value travels in the event body.
    const event = mockEvent({
      topics: ['metadata_set', 1, 'category'],
      data: { value: textEncoder.encode('defi') },
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

  it('promotes a metadata_set with the agentWallet key to AgentWalletSet', () => {
    // The canonical erc-8004 reference flows ALL wallet writes through
    // MetadataSet (no dedicated wallet event). The parser promotes the
    // relevant rows to a typed shape so the DB writer can route them to
    // the wallet column.
    const event = mockEvent({
      topics: ['metadata_set', 1, 'agentWallet'],
      data: { value: textEncoder.encode(MOCK_OWNER) },
    });

    const result = parseIdentityEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'AgentWalletSet',
        agentId: 1,
        newWallet: MOCK_OWNER,
      }),
    );
  });

  it('promotes a metadata_set with the agentWallet key and empty value to AgentWalletUnset', () => {
    // Spec parity: the canonical reference's _update override and
    // unsetAgentWallet emit a MetadataSet with empty bytes. The parser
    // surfaces this as the typed Unset shape.
    const event = mockEvent({
      topics: ['metadata_set', 1, 'agentWallet'],
      data: { value: textEncoder.encode('') },
    });

    const result = parseIdentityEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'AgentWalletUnset',
        agentId: 1,
      }),
    );
  });

  it('drops a wallet metadata_set with malformed bytes', () => {
    // If the bytes do not StrKey-decode, drop the event rather than
    // corrupt the wallet column.
    const event = mockEvent({
      topics: ['metadata_set', 1, 'agentWallet'],
      data: { value: textEncoder.encode('not-a-valid-stellar-address') },
    });

    expect(parseIdentityEvent(event)).toBeNull();
  });

  it('parses an OZ transfer event, taking agentId from token_id data (not topic[1])', () => {
    // OZ NonFungible Transfer: topics = ['transfer', from, to], data is the
    // field-name-keyed map { token_id }. topic[1] is the `from` ADDRESS, so a
    // naive topic[1] read would NaN out — the agentId must come from the data.
    const event = mockEvent({
      topics: ['transfer', new Address(MOCK_OWNER), new Address(MOCK_RECIPIENT)],
      data: { token_id: 42 },
      typeHints: { token_id: 'u32' },
    });

    const result = parseIdentityEvent(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'AgentTransferred',
        agentId: 42,
        from: MOCK_OWNER,
        to: MOCK_RECIPIENT,
      }),
    );
  });

  it('returns null for a transfer with a malformed recipient address', () => {
    const event = mockEvent({
      topics: ['transfer', new Address(MOCK_OWNER), 'not-an-address'],
      data: { token_id: 7 },
      typeHints: { token_id: 'u32' },
    });

    expect(parseIdentityEvent(event)).toBeNull();
  });

  it('returns null for a transfer missing the recipient topic', () => {
    const event = mockEvent({
      topics: ['transfer', new Address(MOCK_OWNER)],
      data: { token_id: 7 },
      typeHints: { token_id: 'u32' },
    });

    expect(parseIdentityEvent(event)).toBeNull();
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
