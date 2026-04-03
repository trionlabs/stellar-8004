import { scValToNative } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

import { parseEventData, toHex } from '../helpers.js';

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
  if (!event.topic || event.topic.length < 3) return null;

  const eventName = scValToNative(event.topic[0]) as string;
  const validatorAddress = String(scValToNative(event.topic[1]));
  const agentId = Number(scValToNative(event.topic[2]));

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

      return {
        type: 'ValidationRequested',
        ...base,
        requestHash: toHex(data.request_hash),
        requestUri: String(data.request_uri ?? ''),
      };
    }

    case 'validation_responded': {
      const data = parseEventData(scValToNative(event.value));

      if (data.response == null) {
        throw new TypeError('ValidationResponded: response field missing');
      }

      return {
        type: 'ValidationResponded',
        ...base,
        requestHash: toHex(data.request_hash),
        response: Number(data.response),
        responseUri: String(data.response_uri ?? ''),
        responseHash: toHex(data.response_hash),
        tag: String(data.tag ?? ''),
      };
    }

    default:
      return null;
  }
}
