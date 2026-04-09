import { scValToNative } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

import { isValidStellarAddress, parseEventData, toHex } from '../helpers.ts';

// Spec compliance pass: ERC-8004 spec event names are `ValidationRequest` and
// `ValidationResponse` (no past-tense suffix). Renamed from the previous
// `ValidationRequested` / `ValidationResponded` to match.
export interface ValidationRequestEvent {
  type: 'ValidationRequest';
  validatorAddress: string;
  agentId: number;
  requestHash: string;
  requestUri: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface ValidationResponseEvent {
  type: 'ValidationResponse';
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
  | ValidationRequestEvent
  | ValidationResponseEvent;

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
  if (!event.topic || event.topic.length < 4) return null;

  const eventName = scValToNative(event.topic[0]) as string;
  const validatorAddress = String(scValToNative(event.topic[1]));
  if (!isValidStellarAddress(validatorAddress)) return null;
  const agentId = Number(scValToNative(event.topic[2]));
  if (!Number.isSafeInteger(agentId) || agentId < 0) return null;
  // Spec compliance pass: `request_hash` is now an indexed topic at index 3.
  const requestHash = toHex(scValToNative(event.topic[3]));
  if (requestHash.length !== 64) return null;

  const base = {
    validatorAddress,
    agentId,
    requestHash,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    txHash: event.txHash,
  };

  switch (eventName) {
    case 'validation_request': {
      const data = parseEventData(scValToNative(event.value));

      return {
        type: 'ValidationRequest',
        ...base,
        requestUri: String(data.request_uri ?? ''),
      };
    }

    case 'validation_response': {
      const data = parseEventData(scValToNative(event.value));

      if (data.response == null) {
        throw new TypeError('ValidationResponse: response field missing');
      }

      const response = Number(data.response);
      if (!Number.isInteger(response) || response < 0 || response > 100) {
        return null;
      }

      return {
        type: 'ValidationResponse',
        ...base,
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
