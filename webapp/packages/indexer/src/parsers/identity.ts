import { scValToNative } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

import { bytesToUtf8, isValidStellarAddress, parseEventData } from '../helpers.js';

export interface RegisteredEvent {
  type: 'Registered';
  agentId: number;
  owner: string;
  agentUri: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface UriUpdatedEvent {
  type: 'UriUpdated';
  agentId: number;
  updatedBy: string;
  newUri: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface MetadataSetEvent {
  type: 'MetadataSet';
  agentId: number;
  key: string;
  value: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface WalletSetEvent {
  type: 'WalletSet';
  agentId: number;
  wallet: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface WalletRemovedEvent {
  type: 'WalletRemoved';
  agentId: number;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export type IdentityEvent =
  | RegisteredEvent
  | UriUpdatedEvent
  | MetadataSetEvent
  | WalletSetEvent
  | WalletRemovedEvent;

export function parseIdentityEvent(
  event: rpc.Api.GetEventsResponse['events'][number],
): IdentityEvent | null {
  if (!event.topic || event.topic.length < 2) return null;

  const eventName = scValToNative(event.topic[0]) as string;
  const agentId = Number(scValToNative(event.topic[1]));
  if (!Number.isSafeInteger(agentId) || agentId < 0) return null;

  const base = {
    agentId,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    txHash: event.txHash,
  };

  switch (eventName) {
    case 'registered': {
      if (event.topic.length < 3) return null;
      const owner = String(scValToNative(event.topic[2]));
      if (!isValidStellarAddress(owner)) return null;
      const data = parseEventData(scValToNative(event.value));

      return {
        type: 'Registered',
        ...base,
        owner,
        agentUri: String(data.agent_uri ?? ''),
      };
    }

    case 'uri_updated': {
      if (event.topic.length < 3) return null;
      const updatedBy = String(scValToNative(event.topic[2]));
      if (!isValidStellarAddress(updatedBy)) return null;
      const data = parseEventData(scValToNative(event.value));

      return {
        type: 'UriUpdated',
        ...base,
        updatedBy,
        newUri: String(data.new_uri ?? ''),
      };
    }

    case 'metadata_set': {
      const data = parseEventData(scValToNative(event.value));

      return {
        type: 'MetadataSet',
        ...base,
        key: String(data.key ?? ''),
        value: bytesToUtf8(data.value),
      };
    }

    case 'wallet_set': {
      const data = parseEventData(scValToNative(event.value));
      const wallet = String(data.wallet ?? '');
      if (!isValidStellarAddress(wallet)) return null;

      return {
        type: 'WalletSet',
        ...base,
        wallet,
      };
    }

    case 'wallet_removed':
      return {
        type: 'WalletRemoved',
        ...base,
      };

    default:
      return null;
  }
}
