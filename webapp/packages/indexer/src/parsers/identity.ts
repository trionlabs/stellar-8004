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

/// ERC-8004 spec event: AgentWalletSet { agentId, newWallet, setBy }.
/// All three fields are indexed in the spec. Renamed from WalletSet in the
/// spec compliance pass.
export interface AgentWalletSetEvent {
  type: 'AgentWalletSet';
  agentId: number;
  newWallet: string;
  setBy: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

/// Soroban-only companion to AgentWalletSet for the unset case. The spec
/// uses AgentWalletSet(agentId, address(0), setBy) but Soroban has no
/// zero-address sentinel, so the unset operation gets its own event.
export interface AgentWalletUnsetEvent {
  type: 'AgentWalletUnset';
  agentId: number;
  setBy: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export type IdentityEvent =
  | RegisteredEvent
  | UriUpdatedEvent
  | MetadataSetEvent
  | AgentWalletSetEvent
  | AgentWalletUnsetEvent;

export function parseIdentityEvent(
  event: rpc.Api.GetEventsResponse['events'][number],
): IdentityEvent | null {
  // scValToNative throws on malformed ScVal payloads. Wrap the whole parser
  // body so a single bad event from the RPC doesn't propagate up and force
  // the indexer's outer catch to mark the entire batch as failed.
  try {
    return parseIdentityEventInner(event);
  } catch {
    return null;
  }
}

function parseIdentityEventInner(
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
      // Spec compliance pass: `key` is now an indexed topic on the
      // contractevent struct. The value still travels in the event body.
      if (event.topic.length < 3) return null;
      const key = String(scValToNative(event.topic[2]));
      const data = parseEventData(scValToNative(event.value));

      return {
        type: 'MetadataSet',
        ...base,
        key,
        value: bytesToUtf8(data.value),
      };
    }

    case 'agent_wallet_set': {
      // Spec compliance: ERC-8004 `AgentWalletSet(agentId, newWallet, setBy)`
      // with all three indexed. We renamed from `wallet_set` and added the
      // `set_by` topic so off-chain consumers can filter by initiator.
      if (event.topic.length < 4) return null;
      const newWallet = String(scValToNative(event.topic[2]));
      if (!isValidStellarAddress(newWallet)) return null;
      const setBy = String(scValToNative(event.topic[3]));
      if (!isValidStellarAddress(setBy)) return null;

      return {
        type: 'AgentWalletSet',
        ...base,
        newWallet,
        setBy,
      };
    }

    case 'agent_wallet_unset': {
      // Soroban-only companion to AgentWalletSet for the unset case.
      // The spec uses AgentWalletSet(agentId, address(0), setBy) but Soroban
      // has no zero-address sentinel, so we emit a separate event.
      if (event.topic.length < 3) return null;
      const setBy = String(scValToNative(event.topic[2]));
      if (!isValidStellarAddress(setBy)) return null;

      return {
        type: 'AgentWalletUnset',
        ...base,
        setBy,
      };
    }

    default:
      return null;
  }
}
