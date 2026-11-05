import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { createTestD1, type TestD1 } from '@stellar8004/d1/test-db';
import { fallback } from './+server.js';
import { PARAMS } from '$lib/server/api/discovery.js';
import spec from '$lib/server/api/openapi.json';

vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_STELLAR_NETWORK: 'mainnet' } }));

const account = (byte: number) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, byte));
const OWNER = account(1);
const CLIENT = account(2);

let db: TestD1;
let platform: unknown;

async function insert(table: string, row: Record<string, unknown>) {
	const keys = Object.keys(row);
	const values = Object.values(row).map((v) =>
		v !== null && typeof v === 'object' ? JSON.stringify(v) : v
	);
	await db
		.prepare(`INSERT INTO ${table} (${keys}) VALUES (${keys.map(() => '?')})`)
		.bind(...values)
		.run();
}

const now = () => new Date().toISOString().replace('Z', '+00:00');
async function setIndexer(advancedAt: string) {
	await db.prepare('DELETE FROM indexer_state').run();
	for (const [i, id] of ['identity', 'reputation', 'validation'].entries()) {
		await insert('indexer_state', { id, last_ledger: 500 + i, last_advanced_at: advancedAt });
	}
}

// 25 agents: scores repeat (ties broken by id), created_at repeats in pairs, every third has
// x402, and agent 24 carries a protocol-valid 1e38 feedback that must clamp to 100.
const SCORES = (id: number) => (id === 24 ? null : id % 4 === 0 ? undefined : (id % 3) * 30);
beforeAll(async () => {
	db = createTestD1();
	for (let id = 0; id < 25; id++) {
		await insert('agents', {
			id,
			owner: OWNER,
			agent_uri_data: { name: id === 7 ? 'Stellar Logo Agent' : `Agent ${id}` },
			supported_trust: id % 5 === 0 ? ['validation'] : ['reputation'],
			x402_enabled: id % 3 === 0 ? 1 : 0,
			created_at: `2026-01-${String(10 + Math.floor(id / 2)).padStart(2, '0')}T00:00:00+00:00`
		});
		const score = SCORES(id);
		if (score !== undefined) {
			await insert('feedback', {
				agent_id: id,
				client_address: CLIENT,
				feedback_index: 1,
				value: score === null ? '1' + '0'.repeat(38) : String(score)
			});
		}
	}
});

beforeEach(async () => {
	platform = { env: { DB: db, API_RATE_LIMITER: { limit: async () => ({ success: true }) } } };
	await setIndexer(now());
});

async function get(query: string) {
	const url = new URL(`https://stellar8004.com/api/v2/discovery?${query}`);
	const res = await fallback({
		request: new Request(url),
		url,
		platform,
		getClientAddress: () => '203.0.113.7'
	} as unknown as Parameters<typeof fallback>[0]);
	return { status: res.status, body: await res.json() };
}

async function walk(query: string, limit: number) {
	const ids: number[] = [];
	let cursor: string | null = null;
	for (let page = 0; page < 50; page++) {
		const { status, body } = await get(
			`${query}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`
		);
		expect(status).toBe(200);
		ids.push(...body.data.map((a: { id: number }) => a.id));
		cursor = body.meta.pagination.nextCursor;
		expect(cursor !== null).toBe(body.meta.pagination.hasMore);
		if (!cursor) return ids;
	}
	throw new Error('walk did not end');
}

const all = Array.from({ length: 25 }, (_, id) => id);
const score = (id: number) => {
	const s = SCORES(id);
	return s === null ? 100 : (s ?? 0);
};

describe('GET /api/v2/discovery', () => {
	it('walks every agent exactly once in each total order, at any page size', async () => {
		const byScore = [...all].sort((a, b) => score(b) - score(a) || a - b);
		const newest = [...all].sort((a, b) => Math.floor(b / 2) - Math.floor(a / 2) || b - a);
		for (const limit of [1, 7, 25, 100]) {
			expect(await walk('network=mainnet', limit)).toEqual(byScore);
			expect(await walk('network=mainnet&sort=newest', limit)).toEqual(newest);
			expect(await walk('network=mainnet&sort=id', limit)).toEqual(all);
		}
	});

	it('clamps scores to 0-100 so a huge valid feedback cannot overflow the order', async () => {
		const { body } = await get('network=mainnet&limit=1');
		expect(body.data[0]).toMatchObject({ id: 24, score: 100 });
		expect(body.meta).toMatchObject({
			version: '2.0.0',
			asOfLedger: 500,
			coverage: { scope: 'indexed_projection', queryComplete: true, snapshot: false }
		});
	});

	it('filters, and the walk keeps the filter', async () => {
		const x402 = all.filter((id) => id % 3 === 0);
		expect(await walk('network=mainnet&sort=id&x402=true', 2)).toEqual(x402);
		expect(await walk('network=mainnet&sort=id&x402=false', 4)).toEqual(
			all.filter((id) => id % 3 !== 0)
		);
		expect(await walk('network=mainnet&sort=id&trust=validation', 2)).toEqual([0, 5, 10, 15, 20]);
		expect(await walk('network=mainnet&sort=id&minScore=60', 3)).toEqual(
			all.filter((id) => score(id) >= 60)
		);
		expect(await walk('network=mainnet&text=logo', 5)).toEqual([7]);
		expect(await walk('network=mainnet&text=the', 5)).toEqual([]);
	});

	it('rejects unknown, repeated and malformed parameters instead of widening the query', async () => {
		for (const query of [
			'',
			'network=testnet',
			'network=mainnet&q=logo',
			'network=mainnet&sort=id&sort=score',
			'network=mainnet&sort=relevance',
			'network=mainnet&limit=0',
			'network=mainnet&limit=101',
			'network=mainnet&limit=5.5',
			'network=mainnet&minScore=101',
			'network=mainnet&minScore=abc',
			'network=mainnet&x402=yes',
			'network=mainnet&text=%20',
			'network=mainnet&trust='
		]) {
			const { status, body } = await get(query);
			expect([query, status, body.error.code]).toEqual([query, 400, 'INVALID_PARAM']);
		}
	});

	it('refuses a cursor from another query or one that was tampered with', async () => {
		const first = await get('network=mainnet&sort=id&limit=3');
		const cursor = first.body.meta.pagination.nextCursor;
		for (const query of [
			`network=mainnet&sort=id&x402=true&cursor=${cursor}`,
			`network=mainnet&sort=newest&cursor=${cursor}`,
			'network=mainnet&sort=id&cursor=not-a-cursor'
		]) {
			const { status, body } = await get(query);
			expect([status, body.error.code]).toEqual([400, 'INVALID_CURSOR']);
		}
		// The page size may change between pages.
		const next = await get(`network=mainnet&sort=id&limit=5&cursor=${cursor}`);
		expect(next.body.data.map((a: { id: number }) => a.id)).toEqual([3, 4, 5, 6, 7]);
	});

	it('fails closed with 503 while the index is stale', async () => {
		await setIndexer('2026-01-01T00:00:00+00:00');
		const { status, body } = await get('network=mainnet');
		expect([status, body.error.code]).toEqual([503, 'INDEX_STALE']);
	});
});

describe('openapi.json', () => {
	it('documents exactly the parameters discovery accepts', () => {
		const documented = spec.paths['/api/v2/discovery'].get.parameters.map((p) => p.name);
		expect(new Set(documented)).toEqual(PARAMS);
	});
});
