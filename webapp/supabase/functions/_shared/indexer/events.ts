// AUTO-GENERATED from packages/indexer/src/events.ts — DO NOT EDIT.
// Regenerate with: pnpm --filter @stellar8004/indexer sync:shared

import type { rpc } from '@stellar/stellar-sdk';
import type { NetworkConfig } from './config.ts';
import { interpretEvent } from './event-interpretation.ts';
import { assertEventPosition } from './historical-source.ts';
import {
  IDENTITY_EVENT_NAMES,
  parseIdentityEvent,
  type IdentityEvent,
} from './parsers/identity.ts';
import {
  REPUTATION_EVENT_NAMES,
  parseReputationEvent,
  type ReputationEvent,
} from './parsers/reputation.ts';
import {
  VALIDATION_EVENT_NAMES,
  parseValidationEvent,
  type ValidationEvent,
} from './parsers/validation.ts';

export type ContractName = keyof NetworkConfig['contracts'];
export type ParsedEvent = IdentityEvent | ReputationEvent | ValidationEvent;
export interface EventPacket {
  id: string;
  contract: ContractName;
  data: ParsedEvent;
}
export const CONTRACT_NAMES: readonly ContractName[] = ['identity', 'reputation', 'validation'];

/** Both sources reach the same interpretation boundary before any write. */
export function prepareEvents(
  events: readonly rpc.Api.EventResponse[],
  config: NetworkConfig,
): EventPacket[] {
  return events.flatMap((event) => {
    const address = event.contractId?.contractId();
    const contract = CONTRACT_NAMES.find((name) => config.contracts[name] === address);
    if (!contract) throw new Error(`Unexpected contract in source page: ${address}`);
    const parsed =
      contract === 'identity'
        ? interpretEvent(event, IDENTITY_EVENT_NAMES, parseIdentityEvent)
        : contract === 'reputation'
          ? interpretEvent(event, REPUTATION_EVENT_NAMES, parseReputationEvent)
          : interpretEvent(event, VALIDATION_EVENT_NAMES, parseValidationEvent);
    if (parsed.status === 'invalid') throw new Error(`Invalid event ${event.id}: ${parsed.reason}`);
    if (parsed.status === 'ignored') return [];
    assertEventPosition(event);
    return [{ id: event.id, contract, data: parsed.event }];
  });
}

/** Registration may follow its initialization events in the same transaction. */
export function parentsFirst(events: readonly EventPacket[]): EventPacket[] {
  return [
    ...events.filter((e) => e.data.type === 'Registered'),
    ...events.filter((e) => e.data.type !== 'Registered'),
  ];
}
