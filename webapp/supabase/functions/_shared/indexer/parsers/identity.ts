import { scValToNative } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

import { bytesToUtf8, isValidStellarAddress, parseEventData } from '../helpers.ts';

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

/// Synthetic wallet-set event derived from a `metadata_set` whose key is the
/// reserved `agentWallet`. The canonical erc-8004 reference flows ALL wallet
/// writes through MetadataSet (no dedicated wallet event), so the parser
/// promotes the relevant MetadataSet rows to this typed shape for the DB
/// writer's convenience. Cross-chain subscribers reading the raw contract
/// events still see only MetadataSet on the wire.
export interface AgentWalletSetEvent {
  type: 'AgentWalletSet';
  agentId: number;
  /// StrKey-decoded address (the metadata value bytes are the StrKey ASCII
  /// representation of the wallet, exactly 56 characters).
  newWallet: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

/// Same provenance as AgentWalletSetEvent but for the unset case
/// (`metadata_set` with key="agentWallet" and an empty bytes value).
export interface AgentWalletUnsetEvent {
  type: 'AgentWalletUnset';
  agentId: number;
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

const AGENT_WALLET_KEY = 'agentWallet';

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
      // Spec compliance: `key` is an indexed topic. The value travels in
      // the event body. The reserved `agentWallet` key is special-cased to
      // a typed AgentWalletSet/Unset event so the DB writer can route it
      // to the dedicated wallet column instead of the generic metadata
      // table. Empty bytes value -> Unset; non-empty -> Set with the
      // StrKey-decoded address.
      if (event.topic.length < 3) return null;
      const key = String(scValToNative(event.topic[2]));
      const data = parseEventData(scValToNative(event.value));

      if (key === AGENT_WALLET_KEY) {
        const valueText = bytesToUtf8(data.value);
        if (valueText.length === 0) {
          return {
            type: 'AgentWalletUnset',
            ...base,
          };
        }
        if (!isValidStellarAddress(valueText)) {
          // The bytes claimed to be a Stellar address but didn't decode.
          // Drop rather than corrupt the wallet column.
          return null;
        }
        return {
          type: 'AgentWalletSet',
          ...base,
          newWallet: valueText,
        };
      }

      return {
        type: 'MetadataSet',
        ...base,
        key,
        value: bytesToUtf8(data.value),
      };
    }

    // --- Legacy event handlers ---
    // The DEPLOYED testnet/mainnet contracts (pre-spec-alignment WASM) still
    // emit dedicated `agent_wallet_set` / `agent_wallet_unset` events instead
    // of flowing wallet writes through `metadata_set`. The parser must handle
    // both formats until the contracts are redeployed AND all historical
    // events from the old WASM are backfilled. Remove these cases once the
    // old events are no longer in the RPC retention window.
    case 'agent_wallet_set': {
      if (event.topic.length < 4) return null;
      const newWallet = String(scValToNative(event.topic[2]));
      if (!isValidStellarAddress(newWallet)) return null;
      return {
        type: 'AgentWalletSet',
        ...base,
        newWallet,
      };
    }

    case 'agent_wallet_unset': {
      return {
        type: 'AgentWalletUnset',
        ...base,
      };
    }

    default:
      return null;
  }
}
