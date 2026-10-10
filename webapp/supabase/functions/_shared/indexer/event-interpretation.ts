// AUTO-GENERATED from packages/indexer/src/event-interpretation.ts — DO NOT EDIT.
// Regenerate with: pnpm --filter @stellar8004/indexer sync:shared

import { scValToNative } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

export type EventInterpretation<E> =
  | { status: 'parsed'; event: E }
  | { status: 'ignored'; reason: 'unsuccessful' | 'unrelated' }
  | { status: 'invalid'; reason: string };

/**
 * Preserve the public parsers' nullable interface while making ingestion
 * distinguish irrelevant events from inputs it cannot safely acknowledge.
 */
export function interpretEvent<E>(
  event: rpc.Api.EventResponse,
  recognizedNames: ReadonlySet<string>,
  parse: (event: rpc.Api.EventResponse) => E | null,
): EventInterpretation<E> {
  if (event.inSuccessfulContractCall === false) {
    return { status: 'ignored', reason: 'unsuccessful' };
  }
  try {
    const parsed = parse(event);
    if (parsed != null) return { status: 'parsed', event: parsed };

    if (!event.topic?.length) {
      return { status: 'invalid', reason: 'Missing event name topic' };
    }
    const name: unknown = scValToNative(event.topic[0]);
    if (typeof name !== 'string') {
      return { status: 'invalid', reason: 'Invalid event name topic' };
    }
    if (!recognizedNames.has(name)) {
      return { status: 'ignored', reason: 'unrelated' };
    }
    return { status: 'invalid', reason: `Malformed recognized event: ${name}` };
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
