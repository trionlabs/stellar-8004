import type { rpc } from '@stellar/stellar-sdk';
import { createTestD1, type TestD1 } from '@stellar8004/d1/test-db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexContracts } from './indexer.js';
import { IDS, account, ev, fakeRpc, rows, seedCheckpoints } from './test-helpers.js';

let db: TestD1;
const OWNER = account();
const CLIENT = account();
const VALIDATOR = account();

beforeEach(() => {
	db = createTestD1();
});
afterEach(() => {
	vi.restoreAllMocks();
});

async function index(
	events: rpc.Api.EventResponse[],
	latest: number,
	oldest = 1,
	options: { allowRetentionClamp?: boolean } = {}
) {
	const server = fakeRpc(events, { latest, oldest });
	const result = await indexContracts(db, server, IDS, Date.now() + 60_000, options);
	return { server, result };
}
const checkpoint = async (id: string) =>
	(
		await rows<Record<string, number | string | null>>(
			db,
			'SELECT * FROM indexer_state WHERE id = ?',
			id
		)
	)[0];
const deadLetters = () =>
	rows(db, 'SELECT contract, reason, event_id, ledger FROM indexer_dead_letter ORDER BY id');
const agent = async (id: number) =>
	(await rows<Record<string, unknown>>(db, 'SELECT * FROM agents WHERE id = ?', id))[0];
const rewind = (ledger: number) =>
	db.prepare('UPDATE indexer_state SET last_ledger = ?').bind(ledger).run();

describe('writers', () => {
	beforeEach(() => seedCheckpoints(db, 99));

	it('registers agents with their metadata and changes them only forward in ledger order', async () => {
		const next = account();
		const wallet = account();
		await index(
			[
				ev.metadata(100, 1, 'agentWallet', OWNER),
				ev.metadata(100, 1, 'name', 'one'),
				ev.registered(100, 1, OWNER),
				ev.uriUpdated(110, 1, OWNER, 'https://agents.example/new.json'),
				ev.metadata(115, 1, 'agentWallet', wallet),
				ev.metadata(118, 1, 'color', 'blue'),
				ev.metadata(119, 1, 'color', 'red')
			],
			120
		);
		expect(await agent(1)).toMatchObject({
			owner: OWNER,
			wallet,
			agent_uri: 'https://agents.example/new.json',
			resolve_uri_pending: 1,
			created_ledger: 100,
			created_at: '2026-04-03T12:00:00+00:00',
			uri_updated_ledger: 110
		});
		expect(await rows(db, 'SELECT key, value FROM agent_metadata ORDER BY key')).toEqual([
			{ key: 'color', value: 'red' },
			{ key: 'name', value: 'one' }
		]);

		// A transfer clears wallet and metadata; replaying older events changes nothing back.
		await index([ev.transfer(130, 1, OWNER, next)], 130);
		await rewind(99);
		await index(
			[
				ev.registered(100, 1, OWNER, 'https://agents.example/old.json'),
				ev.uriUpdated(105, 1, OWNER, 'https://agents.example/older.json'),
				ev.transfer(125, 1, OWNER, account())
			],
			130
		);
		expect(await agent(1)).toMatchObject({
			owner: next,
			wallet: null,
			transferred_ledger: 130,
			agent_uri: 'https://agents.example/new.json'
		});
		expect(await rows(db, 'SELECT * FROM agent_metadata')).toEqual([]);
	});

	it('keeps the resolved document when a URI update is replayed, but applies a new URI', async () => {
		const resolved = () =>
			db
				.prepare(`UPDATE agents SET agent_uri_data = '{"name":"one"}', resolve_uri_pending = 0`)
				.run();
		const updated = ev.uriUpdated(110, 1, OWNER, 'https://agents.example/x.json');
		await index([ev.registered(100, 1, OWNER), updated], 120);
		await resolved();

		await rewind(99);
		await index([ev.registered(100, 1, OWNER), updated], 120);
		expect(await agent(1)).toMatchObject({
			agent_uri_data: '{"name":"one"}',
			resolve_uri_pending: 0
		});

		// A different URI later in the same ledger is a real change.
		await rewind(109);
		await index([ev.uriUpdated(110, 1, OWNER, 'https://agents.example/y.json')], 120);
		expect(await agent(1)).toMatchObject({
			agent_uri: 'https://agents.example/y.json',
			agent_uri_data: null,
			resolve_uri_pending: 1
		});
	});

	it('stores feedback exactly, revokes it, numbers responses, and replays without duplicates', async () => {
		const responder = account();
		const events = [
			ev.registered(100, 1, OWNER),
			ev.feedback(101, 1, CLIENT, 1, 10n ** 38n, 2),
			ev.feedback(101, 1, CLIENT, 2, -5n),
			ev.response(102, 1, CLIENT, 1, responder, 'ipfs://first'),
			ev.response(102, 1, CLIENT, 1, responder, 'ipfs://second'),
			ev.revoked(103, 1, CLIENT, 2)
		];
		await index(events, 110);
		await rewind(99);
		await index(events, 110);

		expect(
			await rows(
				db,
				'SELECT feedback_index, value, value_decimals, is_revoked, revoked_ledger FROM feedback ORDER BY feedback_index'
			)
		).toEqual([
			{
				feedback_index: 1,
				value: '1' + '0'.repeat(38),
				value_decimals: 2,
				is_revoked: 0,
				revoked_ledger: null
			},
			{ feedback_index: 2, value: '-5', value_decimals: 0, is_revoked: 1, revoked_ledger: 103 }
		]);
		expect(
			await rows(
				db,
				'SELECT response_index, response_uri FROM feedback_responses ORDER BY response_index'
			)
		).toEqual([
			{ response_index: 1, response_uri: 'ipfs://first' },
			{ response_index: 2, response_uri: 'ipfs://second' }
		]);
	});

	it('records validation requests once and keeps the latest response', async () => {
		await index(
			[
				ev.registered(100, 1, OWNER),
				ev.validationRequest(101, VALIDATOR, 1, 7),
				ev.validationResponse(102, VALIDATOR, 1, 7, 80, 'security')
			],
			110
		);
		await rewind(99);
		await index(
			[ev.validationRequest(101, VALIDATOR, 1, 7), ev.validationResponse(101, VALIDATOR, 1, 7, 10)],
			110
		);
		expect(
			await rows(
				db,
				'SELECT agent_id, response, tag, has_response, response_ledger FROM validations'
			)
		).toEqual([
			{ agent_id: 1, response: 80, tag: 'security', has_response: 1, response_ledger: 102 }
		]);
	});
});

describe('checkpoints', () => {
	it('refuses to start without a checkpoint row instead of cold-starting', async () => {
		const server = fakeRpc([], { latest: 100 });
		await expect(indexContracts(db, server, IDS, Date.now() + 60_000)).rejects.toThrow(
			/no row for identity/
		);
		expect(server.requests).toEqual([]);
	});

	it('moves last_advanced_at only when last_ledger advances', async () => {
		await seedCheckpoints(db, 99);
		await index([], 150);
		const advanced = await checkpoint('identity');
		expect(advanced).toMatchObject({
			last_ledger: 150,
			expected_next_ledger: 151,
			defer_attempts: 0
		});
		expect(advanced.last_advanced_at).toEqual(expect.any(String));

		// A deferring run rewrites the row but is not progress.
		await db
			.prepare(
				"UPDATE indexer_state SET last_advanced_at = '2026-01-01T00:00:00+00:00', updated_at = 'x'"
			)
			.run();
		await index([ev.feedback(151, 9, CLIENT, 1, 1n)], 160);
		expect(await checkpoint('reputation')).toMatchObject({
			last_ledger: 150,
			defer_attempts: 1,
			last_advanced_at: '2026-01-01T00:00:00+00:00'
		});
		expect((await checkpoint('reputation')).updated_at).not.toBe('x');
	});
});

describe('scan window (live indexer skipped backlogs over 10,000 ledgers)', () => {
	it('reaches events past the first 10,000 ledgers of a backlog', async () => {
		await seedCheckpoints(db, 1_000);
		const { server } = await index(
			[ev.registered(16_000, 1, OWNER), ev.registered(30_500, 2, OWNER)],
			31_000
		);

		expect(await rows(db, 'SELECT id FROM agents ORDER BY id')).toEqual([{ id: 1 }, { id: 2 }]);
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 31_000 });
		const identity = server.requests.filter((r) =>
			r.filters[0].contractIds?.includes(IDS.identity)
		);
		expect(identity.map((r) => [r.startLedger, r.endLedger])).toEqual([
			[1_001, 11_001],
			[11_001, 21_001],
			[21_001, 31_001]
		]);
	});

	it('keeps the windows it finished when the run reaches its deadline', async () => {
		await seedCheckpoints(db, 1_000);
		let now = 0;
		vi.spyOn(Date, 'now').mockImplementation(() => now);
		const server = fakeRpc([ev.registered(5_000, 1, OWNER), ev.registered(15_000, 2, OWNER)], {
			latest: 31_000
		});
		const getEvents = server.getEvents;
		server.getEvents = async (request) => {
			const page = await getEvents(request);
			now = 2_000; // past the deadline once the first page is back
			return page;
		};

		const result = await indexContracts(db, server, IDS, 1_000);
		expect(result.timedOut).toBe(true);
		expect(await rows(db, 'SELECT id FROM agents')).toEqual([{ id: 1 }]);
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 11_000 });
		expect(await checkpoint('reputation')).toMatchObject({ last_ledger: 1_000 });
	});

	it('only advances to the ledger the answering RPC node had reached', async () => {
		await seedCheckpoints(db, 1_000);
		const server = fakeRpc([], { latest: 2_000 });
		const getEvents = server.getEvents;
		server.getEvents = async (request) => {
			server.state.latest = 1_500; // a node behind the one that answered getHealth
			return getEvents(request);
		};
		await indexContracts(db, server, IDS, Date.now() + 60_000);
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 1_500 });
	});
});

describe('registration order (live indexer lost every registration wallet)', () => {
	it("applies Registered before the registration's own metadata events", async () => {
		await seedCheckpoints(db, 99);
		// The contract's order within one transaction: agentWallet, other metadata, Registered.
		const { result } = await index(
			[
				ev.metadata(100, 1, 'agentWallet', OWNER),
				ev.metadata(100, 1, 'name', 'one'),
				ev.registered(100, 1, OWNER)
			],
			100
		);
		expect(result.contracts.identity).toMatchObject({ processed: 3, skipped: 0 });
		expect(result.contracts.identity?.stopped).toBeUndefined();
		expect(await agent(1)).toMatchObject({ wallet: OWNER });
		expect(await rows(db, 'SELECT key FROM agent_metadata')).toEqual([{ key: 'name' }]);
	});

	it('keeps a registration together when a page ends inside its ledger', async () => {
		await seedCheckpoints(db, 99);
		const filler = Array.from({ length: 98 }, (_, i) => ev.metadata(101, 0, `k${i}`, 'v'));
		await index(
			[
				ev.registered(100, 0, OWNER),
				...filler, // 99 events so far: the 100-event page ends after the next one
				ev.metadata(101, 1, 'agentWallet', OWNER),
				ev.metadata(101, 1, 'name', 'one'),
				ev.registered(101, 1, OWNER)
			],
			105
		);
		expect(await agent(1)).toMatchObject({ wallet: OWNER });
		expect(await rows(db, 'SELECT count(*) AS n FROM agent_metadata')).toEqual([{ n: 99 }]);
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 105, defer_attempts: 0 });
	});
});

describe('defer, skip and dead letters', () => {
	it('defers at a missing parent without advancing, then skips it after 5 deferred runs', async () => {
		await seedCheckpoints(db, 99);
		const events = [
			ev.registered(100, 1, OWNER),
			ev.feedback(104, 1, CLIENT, 1, 1n),
			ev.feedback(105, 9, CLIENT, 1, 2n), // agent 9 was never registered
			ev.feedback(106, 1, CLIENT, 2, 3n)
		];
		for (let run = 1; run <= 5; run++) {
			const { result } = await index(events, 110);
			expect(result.contracts.reputation?.stopped).toBe('deferred');
			expect(await checkpoint('reputation')).toMatchObject({
				last_ledger: 99,
				defer_attempts: run
			});
		}
		// Events before the failing one were written; nothing after it was.
		expect(await rows(db, 'SELECT feedback_index FROM feedback')).toEqual([{ feedback_index: 1 }]);
		expect(await deadLetters()).toEqual([]);

		await index(events, 110);
		expect(await rows(db, 'SELECT agent_id, feedback_index FROM feedback ORDER BY id')).toEqual([
			{ agent_id: 1, feedback_index: 1 },
			{ agent_id: 1, feedback_index: 2 }
		]);
		expect(await deadLetters()).toEqual([
			{ contract: 'reputation', reason: 'skip-retryable', event_id: events[2].id, ledger: 105 }
		]);
		expect(await checkpoint('reputation')).toMatchObject({ last_ledger: 110, defer_attempts: 0 });
	});

	it('counts other constraint failures toward skipping too', async () => {
		// No event breaks a non-foreign-key constraint of the schema today; a test-only unique
		// index stands in for one.
		await db.exec('CREATE UNIQUE INDEX test_unique_value ON agent_metadata (value)');
		await seedCheckpoints(db, 99, 4);
		const bad = ev.metadata(102, 2, 'name', 'taken');
		const events = [
			ev.registered(100, 1, OWNER),
			ev.registered(100, 2, OWNER),
			ev.metadata(101, 1, 'name', 'taken'),
			bad
		];
		await index(events, 110);
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 99, defer_attempts: 5 });
		expect(await deadLetters()).toEqual([]);

		await index(events, 110);
		expect(await deadLetters()).toEqual([
			{ contract: 'identity', reason: 'skip-nonretryable', event_id: bad.id, ledger: 102 }
		]);
		expect(await rows(db, 'SELECT agent_id FROM agent_metadata')).toEqual([{ agent_id: 1 }]);
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 110, defer_attempts: 0 });
	});

	it('never counts an RPC failure toward skipping, and the other contracts go on', async () => {
		await seedCheckpoints(db, 99, 4);
		const server = fakeRpc(
			[ev.registered(100, 1, OWNER), ev.validationRequest(101, VALIDATOR, 1, 7)],
			{ latest: 110 }
		);
		const getEvents = server.getEvents;
		server.getEvents = async (request) => {
			if (request.filters[0].contractIds?.includes(IDS.reputation))
				throw new Error('socket hang up');
			return getEvents(request);
		};
		const result = await indexContracts(db, server, IDS, Date.now() + 60_000);
		expect(result.contracts.reputation?.stopped).toBe('rpc-error');
		expect(await checkpoint('reputation')).toMatchObject({ last_ledger: 99, defer_attempts: 4 });
		expect(await checkpoint('validation')).toMatchObject({ last_ledger: 110, defer_attempts: 0 });
	});

	it('stops the run on any other database error without skipping, even when skipping is armed', async () => {
		await seedCheckpoints(db, 99, 5);
		vi.spyOn(db, 'batch').mockRejectedValue(new Error('D1_ERROR: Network connection lost.'));
		await expect(index([ev.registered(100, 1, OWNER)], 110)).rejects.toThrow(
			/Network connection lost/
		);
		expect(await deadLetters()).toEqual([]);
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 99, defer_attempts: 5 });
		expect(await rows(db, 'SELECT id FROM agents')).toEqual([]);
	});

	it('dead-letters an unparseable event once and moves past it', async () => {
		await seedCheckpoints(db, 99);
		const malformed = ev.malformed(100);
		const events = [malformed, ev.registered(101, 1, OWNER)];
		await index(events, 110);
		await rewind(99);
		await index(events, 110);
		expect(await deadLetters()).toEqual([
			{ contract: 'identity', reason: 'unparseable', event_id: malformed.id, ledger: 100 }
		]);
		expect(await agent(1)).toBeDefined();
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 110 });
	});

	it('refuses to skip ledgers that aged out of RPC retention unless allowed', async () => {
		await seedCheckpoints(db, 99);
		const events = [ev.registered(600, 1, OWNER)];
		await expect(index(events, 700, 500)).rejects.toThrow(/ALLOW_RETENTION_CLAMP/);
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 99, last_advanced_at: null });
		expect(await deadLetters()).toEqual([]);

		await index(events, 700, 500, { allowRetentionClamp: true });
		expect(await deadLetters()).toEqual([
			{ contract: 'identity', reason: 'retention-clamp', event_id: null, ledger: 100 },
			{ contract: 'reputation', reason: 'retention-clamp', event_id: null, ledger: 100 },
			{ contract: 'validation', reason: 'retention-clamp', event_id: null, ledger: 100 }
		]);
		expect(await agent(1)).toBeDefined();
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 700 });
	});

	it('does not index dependents past the ledger identity reached', async () => {
		await seedCheckpoints(db, 99);
		const { server } = await index(
			[
				ev.metadata(150, 5, 'name', 'x'),
				ev.registered(100, 1, OWNER),
				ev.feedback(160, 1, CLIENT, 1, 1n)
			],
			200
		);
		// Identity deferred inside its first page, so it stays put, and so do its dependents.
		expect(await checkpoint('identity')).toMatchObject({ last_ledger: 99, defer_attempts: 1 });
		expect(await checkpoint('reputation')).toMatchObject({ last_ledger: 99, defer_attempts: 0 });
		expect(await rows(db, 'SELECT * FROM feedback')).toEqual([]);
		expect(
			server.requests.filter((r) => !r.filters[0].contractIds?.includes(IDS.identity))
		).toEqual([]);
	});
});
