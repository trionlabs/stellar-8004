import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { interpretEvent } from './event-interpretation.js';
import { IDENTITY_EVENT_NAMES, parseIdentityEvent } from './parsers/identity.js';
import { REPUTATION_EVENT_NAMES, parseReputationEvent } from './parsers/reputation.js';
import { VALIDATION_EVENT_NAMES, parseValidationEvent } from './parsers/validation.js';
import { mockEvent } from './parsers/__tests__/helpers.js';

describe('event interpretation with real ScVal parsers', () => {
  it('preserves a valid event and its integer fields', () => {
    const raw = mockEvent({
      topics: [
        'registered',
        1,
        new Address('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
      ],
      data: { agent_uri: 'ipfs://agent' },
    });
    expect(interpretEvent(raw, IDENTITY_EVENT_NAMES, parseIdentityEvent)).toMatchObject({
      status: 'parsed',
      event: { type: 'Registered', agentId: 1, agentUri: 'ipfs://agent' },
    });
  });

  for (const [names, parse] of [
    [IDENTITY_EVENT_NAMES, parseIdentityEvent],
    [REPUTATION_EVENT_NAMES, parseReputationEvent],
    [VALIDATION_EVENT_NAMES, parseValidationEvent],
  ] as const) {
    for (const name of names) {
      it(`does not acknowledge malformed ${name} as unrelated`, () => {
        const raw = mockEvent({ topics: [name] });
        expect(interpretEvent<unknown>(raw, names, parse)).toMatchObject({ status: 'invalid' });
      });
    }
  }

  it('ignores an unrelated event without requiring its data to match our schema', () => {
    const raw = mockEvent({ topics: ['approval'] });
    expect(interpretEvent(raw, IDENTITY_EVENT_NAMES, parseIdentityEvent)).toEqual({
      status: 'ignored',
      reason: 'unrelated',
    });
  });

  it('rejects a missing name instead of assuming it is unrelated', () => {
    const raw = mockEvent({ topics: [] });
    expect(interpretEvent(raw, IDENTITY_EVENT_NAMES, parseIdentityEvent)).toMatchObject({
      status: 'invalid',
    });
  });

  it.each([false, true, '0'])(
    'does not coerce agent ID %s into a registered identity',
    (agentId) => {
      const raw = mockEvent({
        topics: [
          'registered',
          agentId,
          new Address('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
        ],
        data: { agent_uri: 'ipfs://agent' },
      });
      expect(interpretEvent(raw, IDENTITY_EVENT_NAMES, parseIdentityEvent)).toMatchObject({
        status: 'invalid',
      });
    },
  );

  it('does not coerce a boolean into a validation response', () => {
    const raw = mockEvent({
      topics: [
        'validation_response',
        new Address('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
        1,
        new Uint8Array(32),
      ],
      data: { response: false },
    });
    expect(interpretEvent(raw, VALIDATION_EVENT_NAMES, parseValidationEvent)).toMatchObject({
      status: 'invalid',
    });
  });

  it('does not infer an empty URI from a missing registration field', () => {
    const raw = mockEvent({
      topics: [
        'registered',
        1,
        new Address('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
      ],
      data: {},
    });
    expect(interpretEvent(raw, IDENTITY_EVENT_NAMES, parseIdentityEvent)).toMatchObject({
      status: 'invalid',
    });
  });

  it.each([
    { label: 'missing field', body: {} },
    { label: 'boolean body', body: false },
    { label: 'void body', body: null },
    { label: 'vector body', body: [] },
    { label: 'null URI', body: { request_uri: null } },
    { label: 'boolean URI', body: { request_uri: false } },
  ])('rejects a malformed validation request: $label', ({ body }) => {
    const raw = mockEvent({
      topics: [
        'validation_request',
        new Address('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
        1,
        new Uint8Array(32),
      ],
    });
    raw.value = nativeToScVal(body);
    expect(interpretEvent(raw, VALIDATION_EVENT_NAMES, parseValidationEvent)).toMatchObject({
      status: 'invalid',
    });
  });

  it('preserves an explicitly empty validation request URI', () => {
    const raw = mockEvent({
      topics: [
        'validation_request',
        new Address('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
        1,
        new Uint8Array(32),
      ],
      data: { request_uri: '' },
    });
    expect(interpretEvent(raw, VALIDATION_EVENT_NAMES, parseValidationEvent)).toMatchObject({
      status: 'parsed',
      event: { type: 'ValidationRequest', requestUri: '' },
    });
  });

  it.each([
    { label: 'UTF-8 bytes', uri: nativeToScVal(new TextEncoder().encode('ipfs://request')) },
    { label: 'invalid UTF-8 bytes', uri: nativeToScVal(new Uint8Array([255])) },
    {
      label: 'address',
      uri: new Address('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF').toScVal(),
    },
    { label: 'symbol', uri: nativeToScVal('request', { type: 'symbol' }) },
  ])('rejects a validation request URI encoded as $label', ({ uri }) => {
    const raw = mockEvent({
      topics: [
        'validation_request',
        new Address('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
        1,
        new Uint8Array(32),
      ],
    });
    raw.value = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: nativeToScVal('request_uri', { type: 'symbol' }),
        val: uri,
      }),
    ]);
    expect(interpretEvent(raw, VALIDATION_EVENT_NAMES, parseValidationEvent)).toMatchObject({
      status: 'invalid',
    });
  });

  it('captures an unexpected parser failure as invalid input', () => {
    const raw = mockEvent({ topics: ['registered'] });
    expect(
      interpretEvent(raw, IDENTITY_EVENT_NAMES, () => {
        throw new Error('bad XDR');
      }),
    ).toEqual({
      status: 'invalid',
      reason: 'bad XDR',
    });
  });
});
