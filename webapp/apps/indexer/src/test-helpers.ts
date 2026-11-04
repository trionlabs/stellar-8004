// Test-only: event builders and a fake Stellar RPC. Not imported by the Worker.
import { Address, Keypair, Networks, type rpc } from '@stellar/stellar-sdk';
import type { TestD1 } from '@stellar8004/d1/test-db';
import { mockEvent } from './chain/parsers/__tests__/helpers.js';

export const IDS = {
	identity: 'CIDENTITY',
	reputation: 'CREPUTATION',
	validation: 'CVALIDATION'
} as const;
export type Contract = keyof typeof IDS;

export const account = () => Keypair.random().publicKey();
const bytes = (text: string) => new TextEncoder().encode(text);

let sequence = 0;
function event(
	contract: Contract,
	ledger: number,
	options: Omit<Parameters<typeof mockEvent>[0], 'ledger' | 'contractId'>
): rpc.Api.EventResponse {
	const id = `${String(ledger).padStart(19, '0')}-${String(sequence++).padStart(10, '0')}`;
	return { ...mockEvent({ ...options, ledger, contractId: IDS[contract] }), id };
}

export const ev = {
	registered: (
		ledger: number,
		agentId: number,
		owner: string,
		uri = `https://agents.example/${agentId}.json`
	) =>
		event('identity', ledger, {
			topics: ['registered', agentId, new Address(owner)],
			topicTypeHints: { 1: 'u32' },
			data: { agent_uri: uri }
		}),
	metadata: (ledger: number, agentId: number, key: string, value: string) =>
		event('identity', ledger, {
			topics: ['metadata_set', agentId, key],
			topicTypeHints: { 1: 'u32' },
			data: { value: bytes(value) }
		}),
	uriUpdated: (ledger: number, agentId: number, by: string, uri: string) =>
		event('identity', ledger, {
			topics: ['uri_updated', agentId, new Address(by)],
			topicTypeHints: { 1: 'u32' },
			data: { new_uri: uri }
		}),
	transfer: (ledger: number, agentId: number, from: string, to: string) =>
		event('identity', ledger, {
			topics: ['transfer', new Address(from), new Address(to)],
			data: { token_id: agentId },
			typeHints: { token_id: 'u32' }
		}),
	feedback: (
		ledger: number,
		agentId: number,
		client: string,
		index: number,
		value: bigint,
		decimals = 0
	) =>
		event('reputation', ledger, {
			topics: ['new_feedback', agentId, new Address(client), 'quality'],
			topicTypeHints: { 1: 'u32' },
			data: {
				feedback_index: BigInt(index),
				value,
				value_decimals: decimals,
				tag2: '',
				endpoint: '',
				feedback_uri: '',
				feedback_hash: new Uint8Array(32)
			},
			typeHints: { feedback_index: 'u64', value: 'i128', value_decimals: 'u32' }
		}),
	revoked: (ledger: number, agentId: number, client: string, index: number) =>
		event('reputation', ledger, {
			topics: ['feedback_revoked', agentId, new Address(client), BigInt(index)],
			topicTypeHints: { 1: 'u32', 3: 'u64' }
		}),
	response: (
		ledger: number,
		agentId: number,
		client: string,
		index: number,
		responder: string,
		uri: string
	) =>
		event('reputation', ledger, {
			topics: ['response_appended', agentId, new Address(client), new Address(responder)],
			topicTypeHints: { 1: 'u32' },
			data: { feedback_index: BigInt(index), response_uri: uri, response_hash: new Uint8Array(32) },
			typeHints: { feedback_index: 'u64' }
		}),
	validationRequest: (ledger: number, validator: string, agentId: number, hash: number) =>
		event('validation', ledger, {
			topics: [
				'validation_request',
				new Address(validator),
				agentId,
				new Uint8Array(32).fill(hash)
			],
			topicTypeHints: { 2: 'u32' },
			data: { request_uri: `https://validators.example/${hash}` }
		}),
	validationResponse: (
		ledger: number,
		validator: string,
		agentId: number,
		hash: number,
		response: number,
		tag = ''
	) =>
		event('validation', ledger, {
			topics: [
				'validation_response',
				new Address(validator),
				agentId,
				new Uint8Array(32).fill(hash)
			],
			topicTypeHints: { 2: 'u32' },
			data: { response, response_uri: '', response_hash: new Uint8Array(32), tag },
			typeHints: { response: 'u32' }
		}),
	/** A recognized event name with a payload the parser rejects. */
	malformed: (ledger: number) => event('identity', ledger, { topics: ['registered'] })
};

/**
 * A Stellar RPC over a fixed list of events with stellar-rpc's getEvents semantics: one call
 * scans at most 10,000 ledgers whatever endLedger says (exclusive), a full page's cursor is its
 * last event, a short page's cursor marks the end of the scanned range.
 */
export function fakeRpc(
	events: rpc.Api.EventResponse[],
	ledgers: { latest: number; oldest?: number }
) {
	const sorted = [...events].sort((a, b) => a.ledger - b.ledger);
	const state = { latest: ledgers.latest, oldest: ledgers.oldest ?? 1, failNextGetEvents: false };
	const requests: rpc.Api.GetEventsRequest[] = [];
	const retention = () => ({
		latestLedger: state.latest,
		oldestLedger: state.oldest,
		latestLedgerCloseTime: '',
		oldestLedgerCloseTime: ''
	});
	const server = {
		state,
		requests,
		async getHealth() {
			return {
				status: 'healthy' as const,
				ledgerRetentionWindow: state.latest - state.oldest,
				...retention()
			};
		},
		async getNetwork() {
			return { passphrase: Networks.PUBLIC, protocolVersion: '23' };
		},
		async getEvents(request: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse> {
			requests.push(request);
			if (state.failNextGetEvents) {
				state.failNextGetEvents = false;
				throw new Error('socket hang up');
			}
			let start: number;
			let after = -1;
			if (request.cursor) {
				const [kind, value] = request.cursor.split(':');
				if (kind === 'event') {
					after = Number(value);
					start = sorted[after].ledger;
				} else {
					start = Number(value);
					sorted.forEach((e, index) => {
						if (e.ledger <= start) after = index;
					});
				}
			} else {
				start = request.startLedger ?? 0;
			}
			if (start < state.oldest || start > state.latest)
				throw new Error('startLedger must be within the ledger range');
			const end = Math.min(start + 10_000, state.latest + 1, request.endLedger ?? Infinity);
			const limit = request.limit ?? 100;
			const found: number[] = [];
			for (let index = after + 1; index < sorted.length && found.length < limit; index++) {
				const e = sorted[index];
				if (
					e.ledger >= start &&
					e.ledger < end &&
					request.filters[0].contractIds?.includes(String(e.contractId))
				) {
					found.push(index);
				}
			}
			return {
				events: found.map((index) => sorted[index]),
				cursor: found.length === limit ? `event:${found[found.length - 1]}` : `ledger:${end - 1}`,
				...retention()
			};
		}
	};
	return server;
}

export async function seedCheckpoints(db: TestD1, lastLedger: number, deferAttempts = 0) {
	for (const id of Object.keys(IDS)) {
		await db
			.prepare('INSERT INTO indexer_state (id, last_ledger, defer_attempts) VALUES (?, ?, ?)')
			.bind(id, lastLedger, deferAttempts)
			.run();
	}
}

export async function rows<T = Record<string, unknown>>(
	db: TestD1,
	sql: string,
	...params: unknown[]
) {
	return (
		await db
			.prepare(sql)
			.bind(...params)
			.all<T>()
	).results;
}
