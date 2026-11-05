import type { rpc } from '@stellar/stellar-sdk';
import type { Db } from '@stellar8004/d1';
import { interpretEvent } from './chain/event-interpretation.js';
import {
	parentsFirst,
	type ContractName,
	type EventPacket
} from './chain/events.js';
import { log } from './chain/logger.js';
import {
	IDENTITY_EVENT_NAMES,
	parseIdentityEvent
} from './chain/parsers/identity.js';
import {
	REPUTATION_EVENT_NAMES,
	parseReputationEvent
} from './chain/parsers/reputation.js';
import {
	VALIDATION_EVENT_NAMES,
	parseValidationEvent
} from './chain/parsers/validation.js';
import {
	constraintFailure,
	deadLetter,
	eventStatement,
	missingParentStatement,
	pgTime,
	readCheckpoints,
	saveCheckpoint,
	type Checkpoint
} from './db.js';

export type Rpc = Pick<rpc.Server, 'getHealth' | 'getEvents'>;

// stellar-rpc scans at most this many ledgers per getEvents call, whatever endLedger asks for
// (LedgerScanLimit). Requests stay inside windows of this size, so a page that comes back short
// proves the whole window was scanned.
const SCAN_LIMIT = 10_000;
const PAGE_LIMIT = 100;
// Also the D1 batch size: one statement per event.
const BATCH_LIMIT = 100;
// After this many runs in a row deferred at the same event, failing events are skipped and
// dead-lettered so one bad event cannot stall a contract forever.
const MAX_DEFER_ATTEMPTS = 5;

// Identity first: feedback and validations reference its agents.
const CONTRACTS = [
	'identity',
	'reputation',
	'validation'
] as const satisfies readonly ContractName[];

const interpret = {
	identity: (event: rpc.Api.EventResponse) =>
		interpretEvent(event, IDENTITY_EVENT_NAMES, parseIdentityEvent),
	reputation: (event: rpc.Api.EventResponse) =>
		interpretEvent(event, REPUTATION_EVENT_NAMES, parseReputationEvent),
	validation: (event: rpc.Api.EventResponse) =>
		interpretEvent(event, VALIDATION_EVENT_NAMES, parseValidationEvent)
};

export interface ContractResult {
	lastLedger: number;
	processed: number;
	skipped: number;
	/** Why the scan ended before the head, if it did. */
	stopped?: 'deferred' | 'rpc-error' | 'deadline';
}

export interface IndexResult {
	contracts: Partial<Record<ContractName, ContractResult>>;
	timedOut: boolean;
}

/**
 * Indexes each contract from its checkpoint to the RPC head, saving progress after every page.
 * A write that fails on a constraint defers the contract without advancing past it; after
 * MAX_DEFER_ATTEMPTS such runs, failing events are skipped and dead-lettered. RPC failures stop
 * only their contract and never count toward skipping. Any other database error is thrown, so an
 * infrastructure fault can never skip an event. Checkpoints are saved only while `owner` holds the
 * indexer lock; a run that lost it stops with an error.
 */
export async function indexContracts(
	db: Db,
	server: Rpc,
	contractIds: Record<ContractName, string>,
	deadlineMs: number,
	options: { owner: string; allowRetentionClamp?: boolean }
): Promise<IndexResult> {
	const checkpoints = await readCheckpoints(db, CONTRACTS);
	const { latestLedger, oldestLedger } = await server.getHealth();
	// Skipping ledgers that aged out of RPC retention loses their events for good, on the word of
	// one getHealth answer, so it takes an explicit opt-in (ALLOW_RETENTION_CLAMP).
	const aged = CONTRACTS.filter(
		(contract) => checkpoints.get(contract)!.lastLedger + 1 < oldestLedger
	);
	if (aged.length > 0 && !options.allowRetentionClamp) {
		throw new Error(
			`Checkpoints of ${aged.join(', ')} predate RPC retention (oldest ledger ${oldestLedger}); ` +
				'set ALLOW_RETENTION_CLAMP=true to skip the gap and record it in indexer_dead_letter'
		);
	}
	const result: IndexResult = { contracts: {}, timedOut: false };
	let head = latestLedger;
	for (const contract of CONTRACTS) {
		if (Date.now() >= deadlineMs) {
			result.timedOut = true;
			break;
		}
		const scan = {
			contract,
			contractId: contractIds[contract],
			head,
			oldest: oldestLedger,
			deadlineMs,
			owner: options.owner
		};
		const outcome = await indexContract(db, server, scan, checkpoints.get(contract)!);
		result.contracts[contract] = outcome;
		if (outcome.stopped === 'deadline') result.timedOut = true;
		// Stop the dependents where identity stopped, so a lagging identity scan does not turn into
		// foreign-key deferrals that count toward skipping their events.
		if (contract === 'identity') head = Math.min(head, outcome.lastLedger);
	}
	return result;
}

interface Scan {
	contract: ContractName;
	contractId: string;
	head: number;
	oldest: number;
	deadlineMs: number;
	owner: string;
}

async function indexContract(
	db: Db,
	server: Rpc,
	scan: Scan,
	start: Checkpoint
): Promise<ContractResult> {
	const { contract, head } = scan;
	const state = { ...start };
	let saved = { ...start };
	const save = async () => {
		if (state.lastLedger === saved.lastLedger && state.deferAttempts === saved.deferAttempts)
			return;
		await saveCheckpoint(db, contract, state, scan.owner);
		saved = { ...state };
	};
	const result: ContractResult = { lastLedger: state.lastLedger, processed: 0, skipped: 0 };
	if (state.lastLedger >= head) return result;

	let from = state.lastLedger + 1;
	if (from < scan.oldest) {
		// Allowed by the caller (indexContracts refuses otherwise).
		await deadLetter(db, {
			contract,
			reason: 'retention-clamp',
			ledger: from,
			detail: `ledgers ${from}-${scan.oldest - 1} aged out of RPC retention before they were indexed`
		});
		log({
			level: 'warn',
			msg: 'Checkpoint predates RPC retention; clamped',
			contract,
			from,
			oldestLedger: scan.oldest
		});
		state.lastLedger = scan.oldest - 1;
		from = scan.oldest;
		await save();
	}

	const filters = [{ type: 'contract' as const, contractIds: [scan.contractId] }];
	let to = Math.min(head, from + SCAN_LIMIT - 1);
	let cursor: string | undefined;
	// Events of the ledger a full page ended in. A page can end mid-transaction, and a
	// registration emits its metadata before Registered, so ledgers are written only when complete.
	let held: rpc.Api.EventResponse[] = [];
	while (state.lastLedger < head) {
		if (Date.now() >= scan.deadlineMs) {
			result.stopped = 'deadline';
			break;
		}
		let page: rpc.Api.GetEventsResponse;
		try {
			page = await server.getEvents(
				cursor
					? { filters, cursor, limit: PAGE_LIMIT }
					: { filters, startLedger: from, endLedger: to + 1, limit: PAGE_LIMIT }
			);
		} catch (error) {
			result.stopped = 'rpc-error';
			log({
				level: 'error',
				msg: 'getEvents failed; contract waits for the next run',
				contract,
				error: String(error)
			});
			break;
		}

		const inWindow = page.events.filter((event) => event.ledger <= to);
		// Short page, or one that ran past the window: the RPC scanned the whole window.
		const scanned = page.events.length < PAGE_LIMIT || inWindow.length < page.events.length;
		let ready = held.concat(inWindow);
		let reached: number;
		if (scanned) {
			held = [];
			// An RPC node behind our head scanned only to its own latest ledger.
			reached = Math.min(to, page.latestLedger);
		} else {
			const last = ready[ready.length - 1].ledger;
			held = ready.filter((event) => event.ledger === last);
			ready = ready.filter((event) => event.ledger < last);
			reached = last - 1;
		}

		// Skipping is armed only while the count is at the limit: once the stuck event is passed, the
		// count resets and a later failure gets its own deferrals.
		const skip = state.deferAttempts >= MAX_DEFER_ATTEMPTS;
		const written = await writeEvents(db, contract, ready, skip);
		result.processed += written.processed;
		result.skipped += written.skipped;
		if (written.deferred) {
			state.deferAttempts += 1;
			result.stopped = 'deferred';
			break;
		}
		if (reached > state.lastLedger) {
			state.lastLedger = reached;
			// Past the event that deferred (if any): the next failure starts its own count.
			state.deferAttempts = 0;
			await save();
		}

		if (!scanned) {
			cursor = page.cursor;
		} else if (page.latestLedger < to) {
			break;
		} else {
			from = to + 1;
			to = Math.min(head, from + SCAN_LIMIT - 1);
			cursor = undefined;
		}
	}
	await save();
	result.lastLedger = state.lastLedger;
	return result;
}

async function writeEvents(
	db: Db,
	contract: ContractName,
	events: readonly rpc.Api.EventResponse[],
	skip: boolean
): Promise<{ processed: number; skipped: number; deferred: boolean }> {
	const packets: EventPacket[] = [];
	let skipped = 0;
	for (const event of events) {
		const interpreted = interpret[contract](event);
		if (interpreted.status === 'parsed') {
			packets.push({ id: event.id, contract, data: interpreted.event });
		} else if (interpreted.status === 'invalid') {
			// A recognized event we cannot read will not parse on a retry either.
			skipped++;
			log({
				level: 'error',
				msg: 'Unparseable event dead-lettered',
				contract,
				eventId: event.id,
				reason: interpreted.reason
			});
			await deadLetter(db, {
				contract,
				reason: 'unparseable',
				eventId: event.id,
				ledger: event.ledger,
				detail: interpreted.reason
			});
		}
	}

	// The identity contract emits a registration's metadata (agentWallet included) before Registered.
	const ordered = parentsFirst(packets);
	const now = pgTime(new Date());
	let processed = 0;
	for (let offset = 0; offset < ordered.length; offset += BATCH_LIMIT) {
		const chunk = ordered.slice(offset, offset + BATCH_LIMIT);
		const statements = chunk.map((packet) => eventStatement(db, packet, now));
		// Rows each statement changed; null for an event skipped below.
		let changes: Array<number | null>;
		try {
			changes = (await db.batch(statements)).map((result) => result.meta.changes ?? 0);
		} catch (error) {
			if (constraintFailure(error) === null) throw error;
			// The batch rolled back. Replay it one event at a time so only the failing event defers or skips.
			changes = [];
			for (const [index, statement] of statements.entries()) {
				try {
					changes.push((await statement.run()).meta.changes ?? 0);
				} catch (error) {
					const failure = constraintFailure(error);
					if (failure === null) throw error;
					const { id, data } = chunk[index];
					if (!skip) {
						log({
							level: 'warn',
							msg: 'Write failed; deferring to the next run',
							contract,
							eventId: id,
							error: String(error)
						});
						return { processed: processed + changes.length, skipped, deferred: true };
					}
					changes.push(null);
					skipped++;
					log({
						level: 'error',
						msg: `Write failed ${MAX_DEFER_ATTEMPTS} runs in a row; skipping event`,
						contract,
						eventId: id,
						error: String(error)
					});
					await deadLetter(db, {
						contract,
						reason: failure === 'parent' ? 'skip-retryable' : 'skip-nonretryable',
						eventId: id,
						ledger: data.ledger,
						detail: String(error)
					});
				}
			}
		}
		processed += changes.filter((count) => count !== null).length;
		skipped += await recordMissingParents(
			db,
			contract,
			chunk.filter((_, index) => changes[index] === 0)
		);
	}
	return { processed, skipped, deferred: false };
}

/**
 * Dead-letters updates that changed no row because the row they update was never indexed. Not a
 * deferral: that parent was lost earlier, so waiting would only stall the stream. Best effort,
 * like deadLetter. Returns how many were recorded.
 */
async function recordMissingParents(
	db: Db,
	contract: ContractName,
	unchanged: readonly EventPacket[]
): Promise<number> {
	const statements = unchanged.flatMap((packet) => missingParentStatement(db, packet) ?? []);
	if (statements.length === 0) return 0;
	try {
		const recorded = (await db.batch(statements)).filter((result) => result.meta.changes).length;
		if (recorded > 0) {
			log({
				level: 'error',
				msg: 'Updates for rows never indexed dead-lettered',
				contract,
				recorded
			});
		}
		return recorded;
	} catch (error) {
		log({
			level: 'warn',
			msg: 'Failed to record missing-parent dead letters',
			contract,
			error: String(error)
		});
		return 0;
	}
}
