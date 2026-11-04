import type { IdentityEvent } from './parsers/identity.js';
import type { ReputationEvent } from './parsers/reputation.js';
import type { ValidationEvent } from './parsers/validation.js';

export type ContractName = 'identity' | 'reputation' | 'validation';
export type ParsedEvent = IdentityEvent | ReputationEvent | ValidationEvent;
export interface EventPacket {
	id: string;
	contract: ContractName;
	data: ParsedEvent;
}

/** Registration may follow its initialization events in the same transaction. */
export function parentsFirst(events: readonly EventPacket[]): EventPacket[] {
	return [
		...events.filter((e) => e.data.type === 'Registered'),
		...events.filter((e) => e.data.type !== 'Registered')
	];
}
