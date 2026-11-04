import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import {
	ExplorerClient,
	NotFoundError,
	RateLimitError,
	ValidationError
} from '@trionlabs/stellar8004';
import { createTestD1, type TestD1 } from '@stellar8004/d1/test-db';
import { env } from '$env/dynamic/public';
import { fallback } from './+server.js';

vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_STELLAR_NETWORK: 'mainnet' } }));

// The real production response for /api/v1/agents/67, captured from the Supabase API.
const fixture = JSON.parse(
	readFileSync(
		new URL(
			'../../../../../../../packages/sdk/tests/fixtures/api-v1-agent-67.json',
			import.meta.url
		),
		'utf8'
	)
);

const account = (byte: number) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, byte));
const OWNER_A = account(1);
const OWNER_B = account(2);
const NO_AGENTS = account(3);
const CLIENT_1 = account(4);
const CLIENT_2 = account(5);
const CONTRACT_OWNER = StrKey.encodeContract(Buffer.alloc(32, 6));
const IP = '203.0.113.7';

let db: TestD1;
let limiter: { limit: ReturnType<typeof vi.fn> };
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

const at = (day: string) => `2026-${day}T00:00:00+00:00`;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace('Z', '+00:00');

async function seed() {
	const uriData = JSON.parse(
		Buffer.from(fixture.data.agentUri.split(',')[1], 'base64').toString('utf8')
	);
	await insert('agents', {
		id: 67,
		owner: fixture.data.owner,
		agent_uri: fixture.data.agentUri,
		agent_uri_data: uriData,
		services: uriData.services,
		supported_trust: ['reputation'],
		x402_enabled: 1,
		mpp_enabled: 1,
		created_at: fixture.data.createdAt,
		created_ledger: fixture.data.createdLedger,
		tx_hash: fixture.data.txHash
	});
	await insert('agents', {
		id: 1,
		owner: OWNER_A,
		wallet: OWNER_B,
		agent_uri: 'ipfs://agent-1',
		agent_uri_data: {
			name: 'Stellar Logo Agent',
			description: 'Designs logos and wordmarks',
			image: 'https://img/1.png'
		},
		services: [
			{ name: 'MCP', endpoint: 'https://a.example/mcp', version: '1' },
			{ name: 'a2a', endpoint: 'https://a.example/a2a' },
			{ name: 'broken', endpoint: '' }
		],
		supported_trust: ['reputation', 'validation'],
		created_at: at('01-01'),
		created_ledger: 100,
		tx_hash: 'aa'
	});
	await insert('agents', {
		id: 2,
		owner: OWNER_A,
		agent_uri: 'ipfs://agent-2',
		agent_uri_data: { name: '<b>"Bad"</b>', description: 'Bad logo printer' },
		supported_trust: ['tee-attestation'],
		x402_enabled: 1,
		created_at: at('03-01')
	});
	// Same created_at as agent 2: ids break the tie.
	await insert('agents', {
		id: 3,
		owner: OWNER_B,
		agent_uri: 'ipfs://pending',
		created_at: at('03-01')
	});
	await insert('agents', {
		id: 4,
		owner: CONTRACT_OWNER,
		supported_trust: ['TEE'],
		mpp_enabled: 1,
		created_at: at('04-01')
	});
	await insert('agents', {
		id: 5,
		owner: OWNER_B,
		agent_uri: 'ipfs://agent-5',
		agent_uri_data: { name: 'Logo Critic', description: 'Reviews logo designs' },
		created_at: at('05-01')
	});
	// No feedback yet: the old /search read a materialized view and missed agents like this until
	// its next refresh. Its one service entry is not an object; /stats counts it as "other".
	await insert('agents', {
		id: 6,
		owner: OWNER_B,
		agent_uri: 'ipfs://agent-6',
		agent_uri_data: { name: 'Logo Studio' },
		services: ['legacy'],
		created_at: at('06-01')
	});

	const feedback = (row: Record<string, unknown>) => insert('feedback', row);
	await feedback({ agent_id: 67, client_address: CLIENT_1, feedback_index: 1, value: '100' });
	await feedback({
		agent_id: 1,
		client_address: CLIENT_1,
		feedback_index: 1,
		value: '80',
		tag1: 'quality',
		created_at: at('02-01')
	});
	// Same created_at as the next one, but inserted first, so older by id (and first in index order).
	await feedback({
		agent_id: 1,
		client_address: CLIENT_1,
		feedback_index: 2,
		value: '10',
		tag1: 'quality',
		is_revoked: 1,
		created_at: at('02-02')
	});
	await feedback({
		agent_id: 1,
		client_address: CLIENT_2,
		feedback_index: 1,
		value: '9050',
		value_decimals: 2,
		tag1: 'speed',
		tag2: 'fast',
		endpoint: 'https://a.example/mcp',
		feedback_uri: 'ipfs://fb',
		created_at: at('02-02')
	});
	// The owner's own feedback is listed but not scored.
	await feedback({
		agent_id: 1,
		client_address: OWNER_A,
		feedback_index: 1,
		value: '100',
		created_at: at('02-04')
	});
	await feedback({ agent_id: 5, client_address: CLIENT_1, feedback_index: 1, value: '-50' });

	const reply = (index: number, client: string, responseIndex: number, day: string) =>
		insert('feedback_responses', {
			agent_id: 1,
			client_address: client,
			feedback_index: index,
			response_index: responseIndex,
			responder: OWNER_A,
			response_uri: `ipfs://reply-${responseIndex}`,
			created_at: at(day)
		});
	await reply(1, CLIENT_1, 1, '02-05');
	await reply(1, CLIENT_1, 2, '02-06');
	await reply(1, CLIENT_2, 1, '02-07');

	await insert('agent_metadata', { agent_id: 1, key: 'social_links', value: 'https://x.example' });
	await insert('agent_metadata', { agent_id: 1, key: 'a_key', value: null });
	await insert('validations', { request_hash: 'h1', agent_id: 1, validator_address: CLIENT_2 });
	await insert('validations', {
		request_hash: 'h2',
		agent_id: 2,
		validator_address: CLIENT_2,
		response: 90,
		has_response: 1
	});
}

beforeAll(async () => {
	db = createTestD1();
	await seed();
});

beforeEach(() => {
	limiter = { limit: vi.fn().mockResolvedValue({ success: true }) };
	platform = { env: { DB: db, API_RATE_LIMITER: limiter } };
});

/** Calls the route the way SvelteKit does, which decodes the path before filling params. */
async function call(pathAndQuery: string, init?: RequestInit, clientAddress = () => IP) {
	const url = new URL(pathAndQuery, 'https://stellar8004.com/api/v1/');
	const decoded = decodeURIComponent(url.pathname.split('%25').map(decodeURI).join('%25'));
	return fallback({
		request: new Request(url, init),
		url,
		params: { path: decoded.slice('/api/v1/'.length) },
		platform,
		getClientAddress: clientAddress
	} as unknown as Parameters<typeof fallback>[0]);
}

async function json(pathAndQuery: string) {
	const response = await call(pathAndQuery);
	return { status: response.status, headers: response.headers, body: await response.json() };
}

const ids = async (pathAndQuery: string) =>
	(await json(pathAndQuery)).body.data.map((a: { id: number }) => a.id);

describe('GET /agents/:id', () => {
	it('returns the production payload for agent 67, byte for byte', async () => {
		const response = await call('agents/67');
		const text = await response.text();
		const { meta } = JSON.parse(text);
		const expected = {
			...fixture,
			meta: { ...fixture.meta, timestamp: meta.timestamp, requestId: meta.requestId }
		};
		expect(text).toBe(JSON.stringify(expected));
		expect(response.headers.get('Cache-Control')).toBe(
			'public, max-age=30, stale-while-revalidate=120'
		);
	});

	it('formats metadata, scores, services and resolve status', async () => {
		const { data } = (await json('agents/1')).body;
		expect(data).toMatchObject({
			id: 1,
			name: 'Stellar Logo Agent',
			wallet: OWNER_B,
			totalScore: 85.25,
			feedbackCount: 2,
			uniqueClients: 2,
			hasServices: true,
			scores: { total: 85.25, average: 85.25, feedbackCount: 2, uniqueClients: 2 },
			resolveStatus: 'ready',
			createdLedger: 100,
			txHash: 'aa'
		});
		expect(Object.entries(data.metadata)).toEqual([
			['a_key', ''],
			['social_links', 'https://x.example']
		]);
		expect(data.services).toEqual([
			{ name: 'MCP', endpoint: 'https://a.example/mcp', version: '1' },
			{ name: 'a2a', endpoint: 'https://a.example/a2a' }
		]);

		expect((await json('agents/2')).body.data.name).toBe('&lt;b&gt;&quot;Bad&quot;&lt;/b&gt;');
		expect((await json('agents/3')).body.data).toMatchObject({
			name: 'Agent #3',
			description: null,
			image: null,
			resolveStatus: 'resolving',
			wallet: null,
			metadata: {},
			services: [],
			createdLedger: null,
			totalScore: 0
		});
		expect((await json('agents/4')).body.data.resolveStatus).toBe('no-uri');
	});

	it('parses the id like parseInt, and routes on the re-encoded path', async () => {
		expect((await json('agents/1abc')).body.data.id).toBe(1);
		for (const path of ['agents/abc', 'agents/%201']) {
			const { status, body } = await json(path);
			expect(status).toBe(400);
			expect(body.error).toEqual({ code: 'INVALID_ID', message: 'Agent ID must be a number' });
		}
		for (const path of ['agents/999', 'agents/-1']) {
			const { status, body } = await json(path);
			expect(status).toBe(404);
			expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'Agent not found' });
		}
	});
});

describe('GET /agents', () => {
	it('lists newest first with pagination and live scores', async () => {
		const { body, headers } = await json('agents');
		expect(body.data.map((a: { id: number }) => a.id)).toEqual([67, 6, 5, 4, 3, 2, 1]);
		expect(body.meta.pagination).toEqual({ page: 1, limit: 20, total: 7, hasMore: false });
		expect(Object.keys(body.data[1])).toEqual([
			'id',
			'owner',
			'name',
			'description',
			'image',
			'supportedTrust',
			'x402Enabled',
			'mppEnabled',
			'hasServices',
			'createdAt',
			'totalScore',
			'avgScore',
			'feedbackCount',
			'uniqueClients'
		]);
		expect(body.data[1]).toMatchObject({
			id: 6,
			name: 'Logo Studio',
			totalScore: 0,
			feedbackCount: 0
		});
		expect(headers.get('Cache-Control')).toBe('public, max-age=30, stale-while-revalidate=120');
	});

	it('sorts by created_at or id, with id breaking ties', async () => {
		expect(await ids('agents?sortBy=id&sortOrder=asc')).toEqual([1, 2, 3, 4, 5, 6, 67]);
		expect(await ids('agents?sortOrder=asc')).toEqual([1, 2, 3, 4, 5, 6, 67]);
		expect(await ids('agents?sortBy=name&sortOrder=ASC')).toEqual([67, 6, 5, 4, 3, 2, 1]);
	});

	it('clamps page and limit like parseIntParam', async () => {
		const page = async (query: string) => (await json(`agents?${query}`)).body;
		expect((await page('limit=2')).meta.pagination).toEqual({
			page: 1,
			limit: 2,
			total: 7,
			hasMore: true
		});
		expect((await page('page=2&limit=2')).data.map((a: { id: number }) => a.id)).toEqual([5, 4]);
		expect((await page('page=4&limit=2')).meta.pagination.hasMore).toBe(false);
		expect((await page('limit=0')).meta.pagination.limit).toBe(1);
		expect((await page('limit=1000')).meta.pagination.limit).toBe(100);
		expect((await page('page=0&limit=x')).meta.pagination).toMatchObject({ page: 1, limit: 20 });
		const last = await page('page=99999');
		expect(last.meta.pagination.page).toBe(10000);
		expect(last.data).toEqual([]);
	});

	it('filters by search, trust, minScore and the feature flags', async () => {
		expect(await ids('agents?search=logos')).toEqual([6, 5, 2, 1]);
		expect((await json('agents?search=the')).body.meta.pagination).toEqual({
			page: 1,
			limit: 20,
			total: 0,
			hasMore: false
		});
		expect(await ids('agents?trust=validation')).toEqual([1]);
		expect(await ids('agents?trust=reputation,%20tee-attestation')).toEqual([67, 2, 1]);
		expect(await ids('agents?trust=nope,')).toEqual([]);
		expect(await ids('agents?minScore=50')).toEqual([67, 1]);
		expect(await ids('agents?minScore=90.5')).toEqual([67]);
		for (const ignored of ['0', '-5', 'abc', ''])
			expect(await ids(`agents?minScore=${ignored}`)).toHaveLength(7);
		expect(await ids('agents?hasServices=true')).toEqual([67, 6, 1]);
		expect(await ids('agents?x402=true')).toEqual([67, 2]);
		expect(await ids('agents?mpp=true')).toEqual([67, 4]);
		for (const flag of ['hasServices', 'x402', 'mpp'])
			expect(await ids(`agents?${flag}=1`)).toHaveLength(7);
		const combined = await json('agents?search=logo&minScore=1&limit=1');
		expect(combined.body.data.map((a: { id: number }) => a.id)).toEqual([1]);
		expect(combined.body.meta.pagination.total).toBe(1);
	});
});

describe('GET /agents/:id/feedback', () => {
	it('lists all feedback newest first, revoked included, with responses attached', async () => {
		const { body, headers } = await json('agents/1/feedback');
		expect(body.data.map((f: { value: number }) => f.value)).toEqual([100, 9050, 10, 80]);
		expect(body.data[2]).toEqual({
			feedbackIndex: 2,
			clientAddress: CLIENT_1,
			value: 10,
			valueDecimals: 0,
			tag1: 'quality',
			tag2: null,
			endpoint: null,
			feedbackUri: null,
			isRevoked: true,
			createdAt: at('02-02'),
			responses: []
		});
		expect(body.data[1]).toMatchObject({
			tag2: 'fast',
			feedbackUri: 'ipfs://fb',
			isRevoked: false
		});
		expect(body.data[1].responses).toEqual([
			{ responder: OWNER_A, responseUri: 'ipfs://reply-1', createdAt: at('02-07') }
		]);
		expect(body.data[3].responses.map((r: { responseUri: string }) => r.responseUri)).toEqual([
			'ipfs://reply-2',
			'ipfs://reply-1'
		]);
		expect(body.meta.pagination).toEqual({ page: 1, limit: 20, total: 4, hasMore: false });
		expect(headers.get('Cache-Control')).toBe('public, max-age=60, stale-while-revalidate=300');
	});

	it('filters on tag1 and pages', async () => {
		const tagged = (await json('agents/1/feedback?tag=quality')).body;
		expect(tagged.data.map((f: { feedbackIndex: number }) => f.feedbackIndex)).toEqual([2, 1]);
		expect(tagged.meta.pagination.total).toBe(2);
		const second = (await json('agents/1/feedback?page=2&limit=1')).body;
		expect(second.data.map((f: { value: number }) => f.value)).toEqual([9050]);
		expect(second.meta.pagination).toEqual({ page: 2, limit: 1, total: 4, hasMore: true });
	});

	it('returns an empty list for unknown agents and 400 for bad ids', async () => {
		expect((await json('agents/999/feedback')).body.data).toEqual([]);
		expect((await json('agents/x/feedback')).status).toBe(400);
	});
});

describe('GET /accounts/:address/agents', () => {
	it("lists an owner's agents", async () => {
		const { body } = await json(`accounts/${OWNER_A}/agents`);
		expect(body.data.map((a: { id: number }) => a.id)).toEqual([2, 1]);
		expect(body.data[1]).toMatchObject({ owner: OWNER_A, totalScore: 85.25 });
		expect(body.meta.pagination).toEqual({ page: 1, limit: 20, total: 2, hasMore: false });
		expect(await ids(`accounts/${OWNER_A}/agents?sortBy=id&sortOrder=asc`)).toEqual([1, 2]);
		expect((await json(`accounts/${OWNER_A}/agents?limit=1`)).body.meta.pagination.hasMore).toBe(
			true
		);
		expect(await ids(`accounts/${CONTRACT_OWNER}/agents`)).toEqual([4]);
		expect(await ids(`accounts/${NO_AGENTS}/agents`)).toEqual([]);
	});

	it('rejects invalid addresses and unknown sub-paths', async () => {
		for (const address of [
			'not-an-address',
			OWNER_A.toLowerCase(),
			`${OWNER_A}%20`,
			OWNER_A.slice(0, -1) + 'A'
		]) {
			const { status, body } = await json(`accounts/${address}/agents`);
			expect(status).toBe(400);
			expect(body.error.code).toBe('INVALID_ADDRESS');
		}
		expect((await json(`accounts/${OWNER_A}`)).status).toBe(404);
		expect((await json(`accounts/${OWNER_A}/feedback`)).status).toBe(404);
	});
});

describe('GET /search', () => {
	it('ranks by score, then id, skipping negative scores but not new agents', async () => {
		const { body, headers } = await json('search?q=logo');
		expect(body.data.map((a: { id: number }) => a.id)).toEqual([1, 2, 6]);
		expect(body.data[1]).toEqual({
			id: 2,
			name: '<b>"Bad"</b>',
			image: null,
			owner: OWNER_A,
			supportedTrust: ['tee-attestation'],
			hasServices: false,
			x402Enabled: true,
			mppEnabled: false,
			totalScore: 0,
			avgScore: 0,
			feedbackCount: 0,
			uniqueClients: 0
		});
		expect(body.meta.pagination).toBeUndefined();
		expect(headers.get('Cache-Control')).toBe('public, max-age=30, stale-while-revalidate=120');
	});

	it('applies limit, trust and minScore', async () => {
		expect(await ids('search?q=logo&limit=1')).toEqual([1]);
		expect(await ids('search?q=logo&minScore=50')).toEqual([1]);
		for (const clamped of ['-100', 'abc', 'Infinity'])
			expect(await ids(`search?q=logo&minScore=${clamped}`)).toEqual([1, 2, 6]);
		expect(await ids('search?q=logo&trust=tee-attestation')).toEqual([2]);
		expect(await ids('search?q=the')).toEqual([]);
		// FTS5 syntax is never read from user input; "and" is a stopword.
		expect(await ids('search?q=%22Logo*%20AND%20(')).toEqual([1, 2, 6]);
	});

	it('requires q', async () => {
		for (const query of ['', '?q=', '?q=%20%20']) {
			const { status, body } = await json(`search${query}`);
			expect(status).toBe(400);
			expect(body.error).toEqual({
				code: 'MISSING_PARAM',
				message: 'Query parameter "q" is required'
			});
		}
	});
});

describe('GET /stats', () => {
	it('counts everything', async () => {
		const { body, headers } = await json('stats');
		expect(body.data).toEqual({
			totalAgents: 7,
			totalFeedbacks: 6,
			totalValidations: 2,
			totalUniqueClients: 4,
			averageFeedbackScore: 19.3, // (100 + 85.25 - 50) / 7 agents
			agentsWithServices: 3,
			agentsWithX402: 2,
			agentsWithMpp: 2,
			network: 'mainnet',
			protocolDistribution: { a2a: 1, mcp: 1, other: 4 },
			trustDistribution: { reputation: 2, validation: 1, tee: 2 }
		});
		expect(headers.get('Cache-Control')).toBe('public, max-age=60, stale-while-revalidate=300');
	});
});

describe('GET /health', () => {
	const state = async (rows: Record<string, unknown>[]) => {
		await db.prepare('DELETE FROM indexer_state').run();
		for (const row of rows) await insert('indexer_state', row);
		return (await json('health')).body.data;
	};

	it('is healthy while every contract advances', async () => {
		const data = await state([
			{ id: 'identity', last_ledger: 10, updated_at: iso(0), last_advanced_at: iso(60_000) },
			// Rows from before last_advanced_at existed fall back to updated_at.
			{ id: 'reputation', last_ledger: 11, updated_at: iso(60_000) },
			{ id: 'validation', last_ledger: 12, updated_at: iso(0), last_advanced_at: iso(0) }
		]);
		expect(data).toEqual({
			status: 'healthy',
			indexer: {
				identity: { lastLedger: 10, stale: false },
				reputation: { lastLedger: 11, stale: false },
				validation: { lastLedger: 12, stale: false }
			},
			network: 'mainnet'
		});
	});

	it('is degraded when a contract stops advancing or has no state', async () => {
		const data = await state([
			// Still running (updated_at is fresh) but stuck for 6 minutes.
			{ id: 'identity', last_ledger: 10, updated_at: iso(0), last_advanced_at: iso(360_000) },
			{ id: 'reputation', last_ledger: 11, updated_at: iso(0), last_advanced_at: iso(0) }
		]);
		expect(data.status).toBe('degraded');
		expect(data.indexer.identity).toEqual({ lastLedger: 10, stale: true });
		expect(data.indexer.validation).toEqual({ lastLedger: 0, stale: true });
		const response = await call('health');
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(
			'public, max-age=10, stale-while-revalidate=30'
		);
	});
});

describe('router', () => {
	it('answers OPTIONS with the CORS preflight, without counting it', async () => {
		const response = await call('agents', { method: 'OPTIONS' });
		expect(response.status).toBe(204);
		expect(Object.fromEntries(response.headers)).toEqual({
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, OPTIONS',
			'access-control-allow-headers': 'Content-Type, Authorization',
			'access-control-max-age': '86400'
		});
		expect(await response.text()).toBe('');
		expect(limiter.limit).not.toHaveBeenCalled();
	});

	it('rejects every other method, HEAD included, before the limiter', async () => {
		for (const method of ['HEAD', 'POST', 'PUT', 'DELETE', 'PATCH']) {
			const response = await call('agents', { method });
			expect(response.status).toBe(405);
			expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
			if (method !== 'HEAD') {
				expect((await response.json()).error).toEqual({
					code: 'METHOD_NOT_ALLOWED',
					message: 'Only GET requests are supported'
				});
			}
		}
		expect(limiter.limit).not.toHaveBeenCalled();
	});

	it('404s paths the proxy guard rejects, without counting them', async () => {
		// '..' encoded eight times: a '%' is still left after the guard's six decoding rounds.
		const deep = Array.from({ length: 7 }).reduce<string>((s) => encodeURIComponent(s), '%2e%2e');
		const rejected = [
			'',
			'nope',
			'Agents',
			'rest/v1/agents',
			'agents//1',
			'agents/%252e%252e',
			'agents/.%252e/stats',
			`agents/${deep}`,
			'agents/%25',
			'agents/1%5C..',
			'agents/%25E0%25A4%25A'
		];
		for (const path of rejected) {
			const response = await call(path);
			expect(response.status, path).toBe(404);
			expect((await response.json()).error).toEqual({
				code: 'NOT_FOUND',
				message: 'Endpoint not found'
			});
			expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
		}
		expect((await call('nope', { method: 'OPTIONS' })).status).toBe(404);
		expect(limiter.limit).not.toHaveBeenCalled();
	});

	it('404s unknown routes under allowed endpoints after counting them', async () => {
		for (const path of ['agents/1/validations', 'agents/1/feedback/2', 'stats/x', 'accounts']) {
			const { status, body, headers } = await json(path);
			expect(status, path).toBe(404);
			expect(body.error.code).toBe('NOT_FOUND');
			expect(headers.get('X-RateLimit-Limit')).toBe('30');
		}
		expect(limiter.limit).toHaveBeenCalledTimes(4);
	});

	it('sets the headers each status had before', async () => {
		const noCache = 'no-cache, no-store, must-revalidate';
		const cases: [string, string, number, string | null, boolean][] = [
			['agents', 'GET', 200, 'public, max-age=30, stale-while-revalidate=120', true],
			['agents/abc', 'GET', 400, noCache, true],
			['agents/999', 'GET', 404, noCache, true],
			['nope', 'GET', 404, noCache, false],
			['agents', 'POST', 405, noCache, false],
			['agents', 'OPTIONS', 204, null, false]
		];
		for (const [path, method, status, cacheControl, counted] of cases) {
			const response = await call(path, { method });
			expect(response.status, `${method} ${path}`).toBe(status);
			expect(response.headers.get('Content-Type')).toBe(status === 204 ? null : 'application/json');
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
			expect(response.headers.get('Cache-Control')).toBe(cacheControl);
			expect(response.headers.get('X-RateLimit-Limit')).toBe(counted ? '30' : null);
		}
	});

	it('reads meta.network from PUBLIC_STELLAR_NETWORK on every request', async () => {
		const { body } = await json('agents/67');
		expect(body.meta).toMatchObject({ version: '1.0.0', chain: 'stellar', network: 'mainnet' });
		expect(body.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
		env.PUBLIC_STELLAR_NETWORK = 'testnet';
		try {
			expect((await json('stats')).body.meta.network).toBe('testnet');
		} finally {
			env.PUBLIC_STELLAR_NETWORK = 'mainnet';
		}
	});
});

describe('rate limiting', () => {
	const expectRateHeaders = (headers: Headers) => {
		expect(headers.get('X-RateLimit-Limit')).toBe('30');
		const reset = headers.get('X-RateLimit-Reset')!;
		expect(reset).not.toMatch(/^\d+$/);
		expect(Date.parse(reset) - Date.now()).toBeGreaterThan(55_000);
		expect(headers.get('Retry-After')).toBeNull();
	};

	it('counts each request against the client address', async () => {
		const { status, headers } = await json('stats');
		expect(status).toBe(200);
		expect(limiter.limit).toHaveBeenCalledWith({ key: IP });
		expectRateHeaders(headers);
		expect(headers.get('X-RateLimit-Remaining')).toBeNull();
	});

	it('answers 429 when the binding says no', async () => {
		limiter.limit.mockResolvedValue({ success: false });
		const { status, headers, body } = await json('agents/1');
		expect(status).toBe(429);
		expect(body.error).toEqual({
			code: 'RATE_LIMITED',
			message: 'Too many requests. Try again later.'
		});
		expectRateHeaders(headers);
		expect(headers.get('X-RateLimit-Remaining')).toBe('0');
		expect(headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
	});

	it('fails open when the binding errors or is missing', async () => {
		limiter.limit.mockRejectedValue(new Error('limiter down'));
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect((await json('stats')).status).toBe(200);
			limiter.limit.mockImplementation(() => {
				throw new TypeError('sync failure');
			});
			expect((await json('stats')).status).toBe(200);
			expect(
				(
					await call('stats', undefined, () => {
						throw new Error('no address');
					})
				).status
			).toBe(200);
			platform = { env: { DB: db } };
			const { status, headers } = await json('stats');
			expect(status).toBe(200);
			expectRateHeaders(headers);
		} finally {
			quiet.mockRestore();
		}
	});
});

describe('errors', () => {
	it('answers 500 INTERNAL_ERROR, with rate headers, when D1 fails or is missing', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			platform = {
				env: {
					DB: {
						prepare: () => db.prepare('SELECT * FROM missing_table'),
						batch: () => Promise.reject(new Error('D1_ERROR'))
					},
					API_RATE_LIMITER: limiter
				}
			};
			for (const path of [
				'agents',
				'agents/1',
				'agents/1/feedback',
				`accounts/${OWNER_A}/agents`,
				'search?q=logo',
				'stats',
				'health'
			]) {
				const { status, body, headers } = await json(path);
				expect(status, path).toBe(500);
				expect(body.error).toEqual({
					code: 'INTERNAL_ERROR',
					message: 'An unexpected error occurred'
				});
				expect(headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
				expect(headers.get('X-RateLimit-Limit')).toBe('30');
			}
			platform = { env: { API_RATE_LIMITER: limiter } };
			expect((await json('stats')).status).toBe(500);
		} finally {
			quiet.mockRestore();
		}
	});
});

describe('SDK ExplorerClient against this API', () => {
	const sdk = new ExplorerClient('https://stellar8004.com', {
		retries: 0,
		fetch: (input, init) => call(String(input), init)
	});

	it('parses every method', async () => {
		const agents = await sdk.getAgents({
			limit: 2,
			trust: 'reputation',
			minScore: 1,
			hasServices: true,
			sortBy: 'id',
			sortOrder: 'asc'
		});
		expect(agents.data.map((a) => a.id)).toEqual([1, 67]);
		expect(agents.meta.pagination).toEqual({ page: 1, limit: 2, total: 2, hasMore: false });
		expect(agents.meta.network).toBe('mainnet');

		const agent = await sdk.getAgent(67);
		expect(agent.data.services).toStrictEqual(fixture.data.services);
		expect(agent.data.scores).toEqual({
			total: 100,
			average: 100,
			feedbackCount: 1,
			uniqueClients: 1
		});

		const feedback = await sdk.getFeedback(1, { page: 1, tag: 'speed' });
		expect(feedback.data).toEqual([
			expect.objectContaining({ value: 9050, valueDecimals: 2, isRevoked: false })
		]);
		expect(feedback.data[0].responses).toHaveLength(1);

		const owned = await sdk.getAgentsByAddress(OWNER_A);
		expect(owned.data.map((a) => a.id)).toEqual([2, 1]);

		const found = await sdk.search('logo', { limit: 2, minScore: 0 });
		expect(found.data.map((a) => [a.id, a.totalScore])).toEqual([
			[1, 85.25],
			[2, 0]
		]);

		const stats = await sdk.getStats();
		expect(stats.data).toMatchObject({ totalAgents: 7, network: 'mainnet' });

		const health = await sdk.health();
		expect(health.data.indexer.validation).toEqual({
			lastLedger: expect.any(Number),
			stale: expect.any(Boolean)
		});
	});

	it('maps errors, and a 429 does not make it wait for the reset time', async () => {
		await expect(sdk.getAgent(999)).rejects.toBeInstanceOf(NotFoundError);
		await expect(sdk.search('')).rejects.toBeInstanceOf(ValidationError);
		limiter.limit.mockResolvedValue({ success: false });
		const limited = await sdk.getStats().catch((error: unknown) => error);
		expect(limited).toBeInstanceOf(RateLimitError);
		expect((limited as RateLimitError).retryAfterMs).toBe(1000);
	});
});
