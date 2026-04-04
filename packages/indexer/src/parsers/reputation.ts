import { scValToNative } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

import {
  isValidStellarAddress,
  parseEventData,
  toBigInt,
  toHex,
} from '../helpers.js';

export interface NewFeedbackEvent {
  type: 'NewFeedback';
  agentId: number;
  clientAddress: string;
  feedbackIndex: bigint;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackUri: string;
  feedbackHash: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface FeedbackRevokedEvent {
  type: 'FeedbackRevoked';
  agentId: number;
  clientAddress: string;
  feedbackIndex: bigint;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface ResponseAppendedEvent {
  type: 'ResponseAppended';
  agentId: number;
  clientAddress: string;
  responder: string;
  feedbackIndex: bigint;
  responseUri: string;
  responseHash: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export type ReputationEvent =
  | NewFeedbackEvent
  | FeedbackRevokedEvent
  | ResponseAppendedEvent;

export function parseReputationEvent(
  event: rpc.Api.GetEventsResponse['events'][number],
): ReputationEvent | null {
  if (!event.topic || event.topic.length < 3) return null;

  const eventName = scValToNative(event.topic[0]) as string;
  const agentId = Number(scValToNative(event.topic[1]));
  if (!Number.isSafeInteger(agentId) || agentId < 0) return null;
  const clientAddress = String(scValToNative(event.topic[2]));
  if (!isValidStellarAddress(clientAddress)) return null;

  const base = {
    agentId,
    clientAddress,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    txHash: event.txHash,
  };

  switch (eventName) {
    case 'new_feedback': {
      const data = parseEventData(scValToNative(event.value));
      const feedbackIndex = toBigInt(data.feedback_index, 'feedback_index');
      if (feedbackIndex < 1n) return null;
      const valueDecimals = Number(data.value_decimals ?? 0);
      if (!Number.isInteger(valueDecimals) || valueDecimals < 0 || valueDecimals > 18) {
        return null;
      }

      return {
        type: 'NewFeedback',
        ...base,
        feedbackIndex,
        value: toBigInt(data.value, 'value'),
        valueDecimals,
        tag1: String(data.tag1 ?? ''),
        tag2: String(data.tag2 ?? ''),
        endpoint: String(data.endpoint ?? ''),
        feedbackUri: String(data.feedback_uri ?? ''),
        feedbackHash: toHex(data.feedback_hash),
      };
    }

    case 'feedback_revoked': {
      const data = parseEventData(scValToNative(event.value));
      const feedbackIndex = toBigInt(data.feedback_index, 'feedback_index');
      if (feedbackIndex < 1n) return null;

      return {
        type: 'FeedbackRevoked',
        ...base,
        feedbackIndex,
      };
    }

    case 'response_appended': {
      const data = parseEventData(scValToNative(event.value));

      if (data.responder == null) {
        throw new TypeError('ResponseAppended: responder field missing');
      }

      const responder = String(data.responder);
      if (!isValidStellarAddress(responder)) return null;
      const feedbackIndex = toBigInt(data.feedback_index, 'feedback_index');
      if (feedbackIndex < 1n) return null;

      return {
        type: 'ResponseAppended',
        ...base,
        responder,
        feedbackIndex,
        responseUri: String(data.response_uri ?? ''),
        responseHash: toHex(data.response_hash),
      };
    }

    default:
      return null;
  }
}
