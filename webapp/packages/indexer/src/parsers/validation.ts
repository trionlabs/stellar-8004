import { scValToNative } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

import { isValidStellarAddress, parseEventData, toHex } from '../helpers.js';

export interface ValidationRequestedEvent {
  type: 'ValidationRequested';
  validatorAddress: string;
  agentId: number;
  requestHash: string;
  requestUri: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface ValidationRespondedEvent {
  type: 'ValidationResponded';
  validatorAddress: string;
  agentId: number;
  requestHash: string;
  response: number;
  responseUri: string;
  responseHash: string;
  tag: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export type ValidationEvent =
  | ValidationRequestedEvent
  | ValidationRespondedEvent;

export function parseValidationEvent(
  event: rpc.Api.GetEventsResponse['events'][number],
): ValidationEvent | null {
  // scValToNative throws on malformed ScVal payloads. Wrap the parser body
  // so a single bad event from the RPC doesn't propagate up.
  try {
    return parseValidationEventInner(event);
  } catch {
    return null;
  }
}

function parseValidationEventInner(
  event: rpc.Api.GetEventsResponse['events'][number],
): ValidationEvent | null {
  if (!event.topic || event.topic.length < 3) return null;

  const eventName = scValToNative(event.topic[0]) as string;
  const validatorAddress = String(scValToNative(event.topic[1]));
  if (!isValidStellarAddress(validatorAddress)) return null;
  const agentId = Number(scValToNative(event.topic[2]));
  if (!Number.isSafeInteger(agentId) || agentId < 0) return null;

  const base = {
    validatorAddress,
    agentId,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    txHash: event.txHash,
  };

  switch (eventName) {
    case 'validation_requested': {
      const data = parseEventData(scValToNative(event.value));
      const requestHash = toHex(data.request_hash);
      if (requestHash.length !== 64) return null;

      return {
        type: 'ValidationRequested',
        ...base,
        requestHash,
        requestUri: String(data.request_uri ?? ''),
      };
    }

    case 'validation_responded': {
      const data = parseEventData(scValToNative(event.value));

      if (data.response == null) {
        throw new TypeError('ValidationResponded: response field missing');
      }

      const requestHash = toHex(data.request_hash);
      if (requestHash.length !== 64) return null;
      const response = Number(data.response);
      if (!Number.isInteger(response) || response < 0 || response > 100) {
        return null;
      }

      return {
        type: 'ValidationResponded',
        ...base,
        requestHash,
        response,
        responseUri: String(data.response_uri ?? ''),
        responseHash: toHex(data.response_hash),
        tag: String(data.tag ?? ''),
      };
    }

    default:
      return null;
  }
}
