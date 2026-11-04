import { createTestD1, type TestD1 } from '@stellar8004/d1/test-db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pgTime } from './db.js';
import { resolvePending } from './resolve.js';
import { rows } from './test-helpers.js';

let db: TestD1;
const NOW = new Date('2026-11-04T12:00:00Z');
const clock = () => NOW;
const deadline = () => Date.now() + 60_000;
const minutesAgo = (minutes: number) => pgTime(new Date(NOW.getTime() - minutes * 60_000));

beforeEach(() => {
	db = createTestD1();
});

async function pending(
	id: number,
	attempts = 0,
	lastAttempt: string | null = null,
	uri = `https://agents.example/${id}.json`
) {
	await db
		.prepare(
			'INSERT INTO agents (id, owner, agent_uri, resolve_uri_pending, uri_resolve_attempts, last_resolve_attempt_at) VALUES (?, ?, ?, 1, ?, ?)'
		)
		.bind(id, 'GOWNER', uri, attempts, lastAttempt)
		.run();
}
const agent = async (id: number) =>
	(await rows<Record<string, unknown>>(db, 'SELECT * FROM agents WHERE id = ?', id))[0];

describe('resolvePending', () => {
	it('stores the document and the columns derived from it', async () => {
		await pending(1);
		const document = {
			name: 'Logo Agent',
			supportedTrust: ['reputation', ''],
			services: [{ name: 'a2a', endpoint: 'https://a2a.example' }, { name: 'no endpoint' }],
			x402: true
		};
		const result = await resolvePending(db, deadline(), async () => document, clock);

		expect(result).toEqual({ checked: 1, resolved: 1, failed: 0, exhausted: 0 });
		expect(await agent(1)).toMatchObject({
			agent_uri_data: JSON.stringify(document),
			supported_trust: '["reputation"]',
			services: '[{"name":"a2a","endpoint":"https://a2a.example"}]',
			x402_enabled: 1,
			mpp_enabled: 0,
			resolve_uri_pending: 0,
			uri_resolve_attempts: 0
		});
	});

	it('waits 2^attempts minutes after a failed try and gives up after 5 tries', async () => {
		await pending(1, 2, minutesAgo(3)); // needs 4 minutes
		await pending(2, 2, minutesAgo(5));
		await pending(3, 4, minutesAgo(17)); // the fifth and last try
		await pending(4, 5, minutesAgo(600));
		const resolve = vi.fn(async (_uri: string) => null);

		const result = await resolvePending(db, deadline(), resolve, clock);

		expect(resolve.mock.calls.map(([uri]) => uri).sort()).toEqual([
			'https://agents.example/2.json',
			'https://agents.example/3.json'
		]);
		expect(result).toEqual({ checked: 2, resolved: 0, failed: 2, exhausted: 1 });
		expect(await agent(2)).toMatchObject({
			uri_resolve_attempts: 3,
			resolve_uri_pending: 1,
			last_resolve_attempt_at: pgTime(NOW)
		});
		expect(await agent(3)).toMatchObject({ uri_resolve_attempts: 5, resolve_uri_pending: 0 });
		expect(await agent(1)).toMatchObject({
			uri_resolve_attempts: 2,
			last_resolve_attempt_at: minutesAgo(3)
		});
	});

	it('drops results for a URI that changed while it was being fetched', async () => {
		await pending(1);
		await pending(2);
		const resolve = async (uri: string) => {
			const id = uri.endsWith('1.json') ? 1 : 2;
			// What the indexer's UriUpdated write does.
			await db
				.prepare(
					'UPDATE agents SET agent_uri = ?, agent_uri_data = NULL, uri_resolve_attempts = 0, resolve_uri_pending = 1 WHERE id = ?'
				)
				.bind(`https://agents.example/new-${id}.json`, id)
				.run();
			return id === 1 ? { name: 'for the old URI' } : null;
		};
		// Neither result was stored, so neither counts as resolved.
		expect(await resolvePending(db, deadline(), resolve, clock)).toEqual({
			checked: 2,
			resolved: 0,
			failed: 2,
			exhausted: 0
		});

		for (const id of [1, 2]) {
			expect(await agent(id)).toMatchObject({
				agent_uri: `https://agents.example/new-${id}.json`,
				agent_uri_data: null,
				resolve_uri_pending: 1,
				uri_resolve_attempts: 0
			});
		}
	});

	it('resolves at most 20 agents per run, 5 at a time', async () => {
		for (let id = 1; id <= 25; id++) await pending(id);
		let inFlight = 0;
		let peak = 0;
		const resolve = vi.fn(async () => {
			peak = Math.max(peak, ++inFlight);
			await new Promise((done) => setTimeout(done, 1));
			inFlight--;
			return { name: 'agent' };
		});

		const result = await resolvePending(db, deadline(), resolve, clock);

		expect(resolve).toHaveBeenCalledTimes(20);
		expect(peak).toBe(5);
		expect(result.resolved).toBe(20);
		expect(
			await rows(db, 'SELECT count(*) AS n FROM agents WHERE resolve_uri_pending = 1')
		).toEqual([{ n: 5 }]);
	});

	it('records each try first, so a document it cannot store backs off and never blocks the queue', async () => {
		for (let id = 1; id <= 4; id++) await pending(id);
		let nested: unknown = [];
		for (let depth = 0; depth < 1_500; depth++) nested = [nested]; // deeper than SQLite's JSON accepts
		const documents: Record<string, unknown> = {
			// About 1.6 MB stored: the endpoint is copied into services. D1 caps a row at 2,000,000 bytes.
			'https://agents.example/1.json': {
				name: 'big',
				services: [{ name: 'x', endpoint: `https://e.example/${'a'.repeat(800_000)}` }]
			},
			'https://agents.example/2.json': nested,
			'https://agents.example/3.json': { name: 10n }, // JSON.stringify throws
			'https://agents.example/4.json': { name: 'honest' }
		};
		const resolve = vi.fn(async (uri: string) => documents[uri]);

		const result = await resolvePending(db, deadline(), resolve, clock);

		expect(result).toEqual({ checked: 4, resolved: 1, failed: 3, exhausted: 0 });
		expect(await agent(4)).toMatchObject({
			agent_uri_data: '{"name":"honest"}',
			resolve_uri_pending: 0
		});
		for (const id of [1, 2, 3]) {
			expect(await agent(id)).toMatchObject({
				agent_uri_data: null,
				services: '[]',
				uri_resolve_attempts: 1,
				resolve_uri_pending: 1,
				last_resolve_attempt_at: pgTime(NOW)
			});
		}

		// A minute later all three are still backing off.
		resolve.mockClear();
		await resolvePending(db, deadline(), resolve, () => new Date(NOW.getTime() + 60_000));
		expect(resolve).not.toHaveBeenCalled();
	});
});
