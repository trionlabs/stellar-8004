// Every server loader and route the pages use, against a real SQLite database with the D1
// schema. The expected values are what the Supabase versions returned for the same rows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestD1, type TestD1 } from '@stellar8004/d1/test-db';
import { buildMetadataJsonForEdit } from '@trionlabs/stellar8004';
import { load as layoutLoad } from './+layout.server.js';
import { load as homeLoad } from './+page.server.js';
import { load as agentsLoad } from './agents/+page.server.js';
import { load as agentLoad } from './agents/[id]/+page.server.js';
import { load as editLoad } from './agents/[id]/edit/+page.server.js';
import { load as leaderboardLoad } from './leaderboard/+page.server.js';
import { GET as countAgents } from './api/agents/count/+server.js';

const OWNER_A = `G${'A'.repeat(55)}`;
const OWNER_B = `G${'B'.repeat(55)}`;
const NOW = new Date('2026-11-04T12:00:00Z');
const pad = (n: number) => String(n).padStart(2, '0');

let db: TestD1;

/** Inserts one row; objects and arrays are stored as JSON text, as the indexer writes them. */
async function insert(table: string, row: Record<string, unknown>) {
	const columns = Object.keys(row);
	await db
		.prepare(
			`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
		)
		.bind(
			...Object.values(row).map((v) =>
				v !== null && typeof v === 'object' ? JSON.stringify(v) : v
			)
		)
		.run();
}

// The loaders are typed PageServerLoad, which erases what they return; the assertions pin it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;
const run = async (
	load: (event: never) => unknown,
	path: string,
	params: Record<string, string> = {}
) =>
	(await load({
		url: new URL(path, 'https://stellar8004.com'),
		params,
		platform: { env: { DB: db } }
	} as never)) as Data;
const ids = (data: Data) => data.agents.map((agent: Data) => agent.id);

beforeEach(() => {
	db = createTestD1();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('layout', () => {
	it('reports the highest synced ledger and the contract that lags most', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		await insert('indexer_state', {
			id: 'identity',
			last_ledger: 120,
			last_advanced_at: '2026-11-04T11:59:00+00:00'
		});
		await insert('indexer_state', {
			id: 'reputation',
			last_ledger: 100,
			last_advanced_at: '2026-11-04T11:58:00.5+00:00'
		});

		expect(await run(layoutLoad, '/')).toEqual({
			indexerStatus: { syncedLedger: 120, lastAdvancedAt: '2026-11-04T11:58:00.500Z', stale: false }
		});
	});

	it('falls back to updated_at and flags a mirror that stopped advancing', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		await insert('indexer_state', {
			id: 'identity',
			last_ledger: 7,
			updated_at: '2026-11-04T11:50:00+00:00'
		});

		expect(await run(layoutLoad, '/')).toEqual({
			indexerStatus: { syncedLedger: 7, lastAdvancedAt: '2026-11-04T11:50:00.000Z', stale: true }
		});
	});

	it('degrades to null without rows or a database', async () => {
		expect(await run(layoutLoad, '/')).toEqual({ indexerStatus: null });
		expect(await layoutLoad({ platform: undefined } as never)).toEqual({ indexerStatus: null });
	});

	it('stops waiting for the database after 1.5 s', async () => {
		vi.useFakeTimers();
		const hanging = { prepare: () => ({ all: () => new Promise(() => {}) }) };
		let settled = false;
		const result = Promise.resolve(
			layoutLoad({ platform: { env: { DB: hanging } } } as never)
		).then((data) => {
			settled = true;
			return data;
		});

		await vi.advanceTimersByTimeAsync(1_000);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(500);
		expect(await result).toEqual({ indexerStatus: null });
	});
});

describe('home page', () => {
	it('shows the totals, the 10 newest agents and the 10 newest active feedback', async () => {
		for (let i = 1; i <= 11; i++) {
			await insert('agents', {
				id: i,
				owner: OWNER_A,
				created_at: `2026-10-${pad(i)}T00:00:00+00:00`,
				agent_uri_data: i === 11 ? null : { name: `A${i}` }
			});
			await insert('feedback', {
				id: i,
				agent_id: i,
				client_address: 'GC1',
				feedback_index: 1,
				value: `${i}5`,
				value_decimals: 1,
				tag1: 'uptime',
				created_at: `2026-10-${pad(i)}T01:00:00+00:00`
			});
		}
		// The owner's own feedback counts as feedback but not as a client; revoked feedback neither.
		await insert('feedback', {
			id: 20,
			agent_id: 2,
			client_address: OWNER_A,
			feedback_index: 1,
			value: '100',
			created_at: '2026-10-20T00:00:00+00:00'
		});
		await insert('feedback', {
			id: 21,
			agent_id: 1,
			client_address: 'GC2',
			feedback_index: 1,
			value: '1',
			is_revoked: true,
			created_at: '2026-10-30T00:00:00+00:00'
		});

		const data = await run(homeLoad, '/');

		expect(data.stats).toEqual({ totalAgents: 11, totalFeedback: 12, totalClients: 11 });
		expect(data.recentAgents.map((agent: Data) => agent.id)).toEqual([
			11, 10, 9, 8, 7, 6, 5, 4, 3, 2
		]);
		expect(data.recentAgents.slice(0, 2)).toEqual([
			{ id: 11, name: 'Agent #11', createdAt: '2026-10-11T00:00:00+00:00' },
			{ id: 10, name: 'A10', createdAt: '2026-10-10T00:00:00+00:00' }
		]);
		expect(data.recentFeedback.map((feedback: Data) => feedback.id)).toEqual([
			20, 11, 10, 9, 8, 7, 6, 5, 4, 3
		]);
		expect(data.recentFeedback.slice(0, 2)).toEqual([
			{
				id: 20,
				agentId: 2,
				agentName: 'A2',
				clientAddress: OWNER_A,
				score: 100,
				tag: null,
				createdAt: '2026-10-20T00:00:00+00:00'
			},
			{
				id: 11,
				agentId: 11,
				agentName: 'Agent #11',
				clientAddress: 'GC1',
				score: 11.5,
				tag: 'uptime',
				createdAt: '2026-10-11T01:00:00+00:00'
			}
		]);
	});
});

// Four agents: scores 80, 90, 0 (no feedback, no metadata) and -50.
async function seedDirectory() {
	await insert('agents', {
		id: 1,
		owner: OWNER_A,
		created_at: '2026-10-01T00:00:00+00:00',
		agent_uri_data: {
			name: 'Stellar Logo Agent',
			description: 'Designs logos',
			image: 'https://img/1.png'
		},
		services: [{ name: 'web', endpoint: 'https://one' }],
		supported_trust: ['reputation']
	});
	await insert('agents', {
		id: 2,
		owner: OWNER_B,
		created_at: '2026-10-02T00:00:00+00:00',
		agent_uri_data: { name: 'Price Feed', description: 'Market data for Stellar assets' },
		supported_trust: ['crypto-economic']
	});
	await insert('agents', { id: 3, owner: OWNER_A, created_at: '2026-10-03T00:00:00+00:00' });
	await insert('agents', {
		id: 4,
		owner: OWNER_B,
		created_at: '2026-10-03T00:00:00+00:00',
		agent_uri_data: { name: 'Logo Critic', description: 'Reviews logos' },
		services: [{ name: 'mcp', endpoint: 'https://four' }],
		supported_trust: ['reputation', 'tee-attestation']
	});
	await insert('feedback', { agent_id: 1, client_address: 'GC1', feedback_index: 1, value: '80' });
	await insert('feedback', { agent_id: 2, client_address: 'GC1', feedback_index: 1, value: '95' });
	await insert('feedback', { agent_id: 2, client_address: 'GC2', feedback_index: 1, value: '85' });
	await insert('feedback', { agent_id: 4, client_address: 'GC2', feedback_index: 1, value: '-50' });
}

const listed: Record<number, Data> = {
	1: {
		id: 1,
		name: 'Stellar Logo Agent',
		image: 'https://img/1.png',
		owner: OWNER_A,
		createdAt: '2026-10-01T00:00:00+00:00',
		totalScore: 80,
		avgScore: 80,
		feedbackCount: 1,
		uniqueClients: 1,
		supportedTrust: ['reputation'],
		hasServices: true
	},
	2: {
		id: 2,
		name: 'Price Feed',
		image: null,
		owner: OWNER_B,
		createdAt: '2026-10-02T00:00:00+00:00',
		totalScore: 90,
		avgScore: 90,
		feedbackCount: 2,
		uniqueClients: 2,
		supportedTrust: ['crypto-economic'],
		hasServices: false
	},
	3: {
		id: 3,
		name: 'Agent #3',
		image: null,
		owner: OWNER_A,
		createdAt: '2026-10-03T00:00:00+00:00',
		totalScore: 0,
		avgScore: 0,
		feedbackCount: 0,
		uniqueClients: 0,
		supportedTrust: [],
		hasServices: false
	},
	4: {
		id: 4,
		name: 'Logo Critic',
		image: null,
		owner: OWNER_B,
		createdAt: '2026-10-03T00:00:00+00:00',
		totalScore: -50,
		avgScore: -50,
		feedbackCount: 1,
		uniqueClients: 1,
		supportedTrust: ['reputation', 'tee-attestation'],
		hasServices: true
	}
};
// Rows read from the leaderboard carry no creation date.
const ranked = (id: number) => ({ ...listed[id], createdAt: null });

describe('agents page', () => {
	beforeEach(seedDirectory);

	it('lists newest first, then by id, with each agent’s scores', async () => {
		expect(await run(agentsLoad, '/agents')).toEqual({
			agents: [listed[3], listed[4], listed[2], listed[1]],
			query: '',
			sort: 'created_at',
			order: 'desc',
			page: 1,
			total: 4,
			hasMore: false,
			filters: { trust: [], minScore: 0, hasServices: false },
			ownerFilter: ''
		});
		expect((await run(agentsLoad, `/agents?owner=${OWNER_B}`)).total).toBe(2);
		expect(ids(await run(agentsLoad, '/agents?order=asc'))).toEqual([1, 2, 3, 4]);
		expect(ids(await run(agentsLoad, `/agents?owner=${OWNER_A}`))).toEqual([3, 1]);
		expect(ids(await run(agentsLoad, '/agents?sort=bogus&order=sideways'))).toEqual([3, 4, 2, 1]);
	});

	it('sorts by score or feedback count from the leaderboard, ties by id', async () => {
		expect((await run(agentsLoad, '/agents?sort=score')).agents).toEqual([
			ranked(2),
			ranked(1),
			ranked(3),
			ranked(4)
		]);
		expect(ids(await run(agentsLoad, '/agents?sort=score&order=asc'))).toEqual([4, 3, 1, 2]);
		expect(ids(await run(agentsLoad, '/agents?sort=feedback'))).toEqual([2, 1, 4, 3]);
		expect(ids(await run(agentsLoad, `/agents?sort=feedback&owner=${OWNER_B}`))).toEqual([2, 4]);
	});

	it('searches every word of names and descriptions, then applies the chosen sort', async () => {
		const data = await run(agentsLoad, '/agents?q=%20logos%20');
		expect(data.agents).toEqual([listed[4], listed[1]]);
		expect(data.total).toBe(2);
		expect(data.query).toBe('logos');
		expect(ids(await run(agentsLoad, '/agents?q=logo&sort=score'))).toEqual([1, 4]);
		expect(ids(await run(agentsLoad, '/agents?q=stellar+market'))).toEqual([2]);
		expect(ids(await run(agentsLoad, `/agents?q=logo&owner=${OWNER_B}`))).toEqual([4]);
		expect(ids(await run(agentsLoad, '/agents?q=-logo*+('))).toEqual([4, 1]); // FTS5 syntax is just text
		// Only stopwords: no match, as plainto_tsquery gave none.
		expect(await run(agentsLoad, '/agents?q=the')).toMatchObject({
			agents: [],
			total: 0,
			hasMore: false,
			query: 'the'
		});
	});

	it('applies the advanced filters to the leaderboard, best score first', async () => {
		const data = await run(agentsLoad, '/agents?trust=reputation&trust=crypto-economic&trust=');
		// Agent 4 trusts reputation, but min_score 0 still applies, as in search_agents_advanced.
		expect(data.agents).toEqual([ranked(2), ranked(1)]);
		expect(data.total).toBe(2);
		expect(data.filters).toEqual({
			trust: ['reputation', 'crypto-economic'],
			minScore: 0,
			hasServices: false
		});
		expect(ids(await run(agentsLoad, '/agents?trust=tee-attestation'))).toEqual([]);
		expect(ids(await run(agentsLoad, '/agents?min_score=85'))).toEqual([2]);
		expect(ids(await run(agentsLoad, '/agents?services=true'))).toEqual([1]);
		expect(ids(await run(agentsLoad, '/agents?services=true&q=logos'))).toEqual([1]);
		expect(ids(await run(agentsLoad, '/agents?min_score=1&q=price'))).toEqual([2]);
		expect(ids(await run(agentsLoad, '/agents?min_score=1&q=the'))).toEqual([]);
		expect(ids(await run(agentsLoad, `/agents?min_score=1&owner=${OWNER_A}`))).toEqual([1]);
		expect(await run(agentsLoad, '/agents?min_score=500')).toMatchObject({
			agents: [],
			filters: { trust: [], minScore: 100, hasServices: false }
		});
	});
});

describe('agents page paging', () => {
	it('pages 20 at a time and ignores bad page numbers', async () => {
		for (let i = 1; i <= 21; i++) {
			await insert('agents', {
				id: i,
				owner: OWNER_A,
				created_at: `2026-03-${pad(i)}T00:00:00+00:00`
			});
		}

		// The count is every match, not the 20 on this page.
		expect(await run(agentsLoad, '/agents')).toMatchObject({ page: 1, total: 21, hasMore: true });
		expect(ids(await run(agentsLoad, '/agents'))).toHaveLength(20);
		expect(await run(agentsLoad, '/agents?page=2')).toMatchObject({
			agents: [{ id: 1 }],
			page: 2,
			total: 21,
			hasMore: false
		});
		expect(ids(await run(agentsLoad, '/agents?sort=score&page=2'))).toEqual([21]);
		expect(await run(agentsLoad, '/agents?page=99')).toMatchObject({
			agents: [],
			page: 99,
			hasMore: false
		});
		expect((await run(agentsLoad, '/agents?page=2.9')).page).toBe(2);
		for (const page of ['0', '-3', 'abc', '']) {
			expect((await run(agentsLoad, `/agents?page=${page}`)).page).toBe(1);
		}
	});

	it('offers no next page when the last page is exactly full', async () => {
		for (let i = 1; i <= 20; i++) {
			await insert('agents', {
				id: i,
				owner: OWNER_A,
				created_at: `2026-03-${pad(i)}T00:00:00+00:00`
			});
		}
		expect(await run(agentsLoad, '/agents')).toMatchObject({ total: 20, hasMore: false });
		expect(await run(agentsLoad, '/agents?sort=score')).toMatchObject({
			total: 20,
			hasMore: false
		});
	});

	it('fills a search page with the most relevant matches, as ts_rank ordering did', async () => {
		// The oldest agent matches best, so it belongs on page 1 although 21 newer agents match.
		await insert('agents', {
			id: 0,
			owner: OWNER_A,
			created_at: '2026-01-01T00:00:00+00:00',
			agent_uri_data: { name: 'Logo logo logo' }
		});
		for (let i = 1; i <= 21; i++) {
			await insert('agents', {
				id: i,
				owner: OWNER_A,
				created_at: `2026-02-${pad(i)}T00:00:00+00:00`,
				agent_uri_data: { name: `Agent ${i} logo` }
			});
		}

		const first = await run(agentsLoad, '/agents?q=logo');
		expect(ids(first)).toEqual([...Array.from({ length: 19 }, (_, i) => 19 - i), 0]);
		expect(first.hasMore).toBe(true);
		expect(ids(await run(agentsLoad, '/agents?q=logo&page=2'))).toEqual([21, 20]);
	});
});

describe('agent page', () => {
	const uriData = {
		name: 'Nova',
		description: 'Weather data',
		image: 'https://img/nova.png',
		services: [{ name: 'MCP', endpoint: 'https://nova/mcp' }],
		supportedTrust: ['reputation']
	};
	const feedbackDefaults = {
		feedbackUri: null,
		feedbackHash: null,
		tag2: null,
		txHash: null,
		createdLedger: null
	};

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		await insert('agents', {
			id: 7,
			owner: OWNER_A,
			agent_uri: 'https://nova/agent.json',
			agent_uri_data: uriData,
			wallet: OWNER_B,
			created_at: '2026-10-01T10:00:00+00:00',
			updated_at: '2026-10-02T10:00:00.5+00:00',
			services: [
				{ name: 'MCP', endpoint: 'https://nova/mcp', version: '1.0.0' },
				{ name: 'no endpoint' }
			],
			supported_trust: ['reputation'],
			x402_enabled: true
		});
		await insert('agents', { id: 8, owner: OWNER_B });
		await insert('agents', { id: 9, owner: OWNER_B });
		await insert('agents', { id: 10, owner: OWNER_B });
		await insert('agent_metadata', { agent_id: 7, key: 'region', value: 'eu' });
		await insert('agent_metadata', { agent_id: 7, key: 'model', value: null });
		await insert('feedback', {
			id: 1,
			agent_id: 7,
			client_address: 'GC1',
			feedback_index: 1,
			value: '9050',
			value_decimals: 2,
			tag1: 'uptime',
			tx_hash: 'tx1',
			created_ledger: 100,
			created_at: '2026-11-01T09:00:00+00:00'
		});
		await insert('feedback', {
			id: 2,
			agent_id: 7,
			client_address: 'GC1',
			feedback_index: 2,
			value: '70',
			tag1: 'starred',
			created_at: '2026-10-20T09:00:00+00:00'
		});
		await insert('feedback', {
			id: 3,
			agent_id: 7,
			client_address: 'GC2',
			feedback_index: 1,
			value: '-10',
			value_decimals: 1,
			tag1: 'uptime',
			is_revoked: true,
			created_at: '2026-11-02T09:00:00+00:00'
		});
		await insert('feedback', {
			id: 4,
			agent_id: 7,
			client_address: OWNER_A,
			feedback_index: 1,
			value: '100',
			created_at: '2026-11-03T08:00:00+00:00'
		});
		await insert('feedback_responses', {
			id: 1,
			agent_id: 7,
			client_address: 'GC1',
			feedback_index: 1,
			response_index: 1,
			responder: OWNER_A,
			response_uri: 'ipfs://r1',
			created_at: '2026-11-01T10:00:00+00:00'
		});
		await insert('feedback_responses', {
			id: 2,
			agent_id: 7,
			client_address: 'GC1',
			feedback_index: 1,
			response_index: 2,
			responder: OWNER_A,
			created_at: '2026-11-01T11:00:00+00:00'
		});
		await insert('validations', {
			request_hash: 'a'.repeat(64),
			agent_id: 7,
			validator_address: 'GV1',
			response: 95,
			has_response: true,
			response_uri: 'ipfs://v',
			tag: 'uptime',
			request_tx_hash: 'rq',
			response_tx_hash: 'rs',
			created_at: '2026-10-05T00:00:00+00:00',
			responded_at: '2026-10-06T00:00:00+00:00'
		});
		await insert('validations', {
			request_hash: 'short',
			agent_id: 7,
			validator_address: 'GV2',
			created_at: '2026-10-07T00:00:00+00:00'
		});
		// Agent 8 scores 95 and agent 9 ties agent 7 at 80.25.
		await insert('feedback', {
			agent_id: 8,
			client_address: 'GC3',
			feedback_index: 1,
			value: '95'
		});
		await insert('feedback', {
			agent_id: 9,
			client_address: 'GC3',
			feedback_index: 1,
			value: '8025',
			value_decimals: 2
		});
	});

	it('shows the agent, its feedback with responses, validations, scores and rank', async () => {
		expect(await run(agentLoad, '/agents/7', { id: '7' })).toEqual({
			state: 'ready',
			justRegistered: false,
			txHash: null,
			uriResolveAttempts: 0,
			tag: '',
			agent: {
				id: 7,
				name: 'Nova',
				description: 'Weather data',
				image: 'https://img/nova.png',
				owner: OWNER_A,
				wallet: OWNER_B,
				agentUri: 'https://nova/agent.json',
				supportedTrust: ['reputation'],
				services: [{ name: 'MCP', endpoint: 'https://nova/mcp', version: '1.0.0' }],
				createdAt: '2026-10-01T10:00:00+00:00',
				updatedAt: '2026-10-02T10:00:00.5+00:00',
				x402Enabled: true,
				mppEnabled: false,
				registrationData: JSON.stringify(uriData, null, 2)
			},
			metadata: [
				{ agent_id: 7, key: 'model', value: null },
				{ agent_id: 7, key: 'region', value: 'eu' }
			],
			feedback: [
				{
					...feedbackDefaults,
					id: 4,
					clientAddress: OWNER_A,
					score: 100,
					tag1: null,
					isRevoked: false,
					createdAt: '2026-11-03T08:00:00+00:00',
					responses: []
				},
				{
					...feedbackDefaults,
					id: 3,
					clientAddress: 'GC2',
					score: -1,
					tag1: 'uptime',
					isRevoked: true,
					createdAt: '2026-11-02T09:00:00+00:00',
					responses: []
				},
				{
					...feedbackDefaults,
					id: 1,
					clientAddress: 'GC1',
					score: 90.5,
					tag1: 'uptime',
					isRevoked: false,
					createdAt: '2026-11-01T09:00:00+00:00',
					txHash: 'tx1',
					createdLedger: 100,
					responses: [
						{
							id: 2,
							responder: OWNER_A,
							responseUri: null,
							createdAt: '2026-11-01T11:00:00+00:00'
						},
						{
							id: 1,
							responder: OWNER_A,
							responseUri: 'ipfs://r1',
							createdAt: '2026-11-01T10:00:00+00:00'
						}
					]
				},
				{
					...feedbackDefaults,
					id: 2,
					clientAddress: 'GC1',
					score: 70,
					tag1: 'starred',
					isRevoked: false,
					createdAt: '2026-10-20T09:00:00+00:00',
					responses: []
				}
			],
			validations: [
				{
					requestHash: 'short',
					requestHashShort: 'short',
					validatorAddress: 'GV2',
					response: null,
					hasResponse: false,
					requestUri: null,
					responseUri: null,
					responseHash: null,
					requestTxHash: null,
					responseTxHash: null,
					tag: null,
					createdAt: '2026-10-07T00:00:00+00:00',
					respondedAt: null
				},
				{
					requestHash: 'a'.repeat(64),
					requestHashShort: 'aaaaaaaaaa…aaaa',
					validatorAddress: 'GV1',
					response: 95,
					hasResponse: true,
					requestUri: null,
					responseUri: 'ipfs://v',
					responseHash: null,
					requestTxHash: 'rq',
					responseTxHash: 'rs',
					tag: 'uptime',
					createdAt: '2026-10-05T00:00:00+00:00',
					respondedAt: '2026-10-06T00:00:00+00:00'
				}
			],
			// The owner's own and the revoked feedback do not count towards the score.
			scores: {
				totalScore: 80.25,
				avgScore: 80.25,
				feedbackCount: 2,
				uniqueClients: 1,
				rank: 2,
				totalAgents: 4
			},
			clientBreakdown: [
				{
					clientAddress: 'GC1',
					feedbackCount: 2,
					avgScore: 80.25,
					lastFeedback: '2026-11-01T09:00:00+00:00'
				},
				{
					clientAddress: OWNER_A,
					feedbackCount: 1,
					avgScore: 100,
					lastFeedback: '2026-11-03T08:00:00+00:00'
				}
			],
			metadataCompleteness: 100,
			metadataMissing: [],
			recentFeedbackCount: 2
		});
	});

	it('filters feedback by an allowed tag only', async () => {
		const tagged = await run(agentLoad, '/agents/7?tag=uptime', { id: '7' });
		expect(tagged.tag).toBe('uptime');
		expect(tagged.feedback.map((feedback: Data) => feedback.id)).toEqual([3, 1]);
		expect(tagged.clientBreakdown).toEqual([
			{
				clientAddress: 'GC1',
				feedbackCount: 1,
				avgScore: 90.5,
				lastFeedback: '2026-11-01T09:00:00+00:00'
			}
		]);
		const untagged = await run(agentLoad, "/agents/7?tag=x'%20OR%201=1", { id: '7' });
		expect([untagged.tag, untagged.feedback.length]).toEqual(['', 4]);
	});

	it('ranks ties together and scores an agent without feedback as 0', async () => {
		expect((await run(agentLoad, '/agents/9', { id: '9' })).scores).toMatchObject({
			totalScore: 80.25,
			rank: 2
		});
		expect(await run(agentLoad, '/agents/10', { id: '10' })).toMatchObject({
			state: 'no-uri',
			agent: {
				name: 'Agent #10',
				description: null,
				image: null,
				registrationData: null,
				services: [],
				supportedTrust: []
			},
			scores: {
				totalScore: 0,
				avgScore: 0,
				feedbackCount: 0,
				uniqueClients: 0,
				rank: 4,
				totalAgents: 4
			},
			metadataCompleteness: 0,
			metadataMissing: ['name', 'description', 'image', 'services', 'trust']
		});
	});

	it('derives the resolution state from the agent row', async () => {
		await insert('agents', {
			id: 11,
			owner: OWNER_A,
			agent_uri: 'https://x',
			resolve_uri_pending: true,
			uri_resolve_attempts: 2
		});
		await insert('agents', { id: 12, owner: OWNER_A, agent_uri: 'https://x' });
		expect(await run(agentLoad, '/agents/11', { id: '11' })).toMatchObject({
			state: 'resolving',
			uriResolveAttempts: 2
		});
		expect((await run(agentLoad, '/agents/12', { id: '12' })).state).toBe('failed');
	});

	it('rejects bad ids, 404s unknown agents and shows a just-registered agent as indexing', async () => {
		for (const id of ['abc', '-1', '1.5', '2147483648']) {
			await expect(run(agentLoad, `/agents/${id}`, { id })).rejects.toMatchObject({ status: 400 });
		}
		await expect(run(agentLoad, '/agents/99', { id: '99' })).rejects.toMatchObject({
			status: 404,
			body: { message: 'Agent not found' }
		});
		const tx = 'ab'.repeat(32);
		expect(await run(agentLoad, `/agents/99?registered=true&tx=${tx}`, { id: '99' })).toMatchObject(
			{
				state: 'indexing',
				txHash: tx,
				agent: { id: 99, name: 'Agent #99' },
				scores: null
			}
		);
		expect(
			(await run(agentLoad, '/agents/99?registered=true&tx=nope', { id: '99' })).txHash
		).toBeNull();
	});
});

describe('edit page', () => {
	const uriData = {
		type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
		name: 'Nova',
		description: 'Weather data',
		image: 'https://img/nova.png',
		services: [{ name: 'MCP', endpoint: 'https://nova/mcp', version: '1.0.0' }],
		supportedTrust: ['reputation'],
		x402: true,
		registrations: [{ agentId: 5, agentRegistry: 'stellar:registry' }],
		license: 'MIT',
		extra: { nested: [1, 2.5, { deep: true, none: null }] }
	};
	const services = [
		{
			name: 'MCP',
			endpoint: 'https://nova/mcp',
			version: '1.0.0',
			description: 'Model Context Protocol'
		}
	];
	// What +page.svelte builds from data.agent before it calls buildMetadataJsonForEdit.
	const form = (agent: Data) => ({
		name: agent.name,
		description: agent.description ?? '',
		imageUrl: agent.image ?? '',
		services: agent.services,
		supportedTrust: agent.supportedTrust,
		x402Enabled: agent.x402Enabled,
		mppEnabled: agent.mppEnabled
	});

	beforeEach(async () => {
		await insert('agents', {
			id: 5,
			owner: OWNER_A,
			agent_uri: 'data:application/json;base64,e30=',
			agent_uri_data: uriData,
			services,
			supported_trust: ['reputation', 'crypto-economic'],
			x402_enabled: true
		});
	});

	it('gives the page the stored metadata as parsed JSON and real booleans', async () => {
		expect(await run(editLoad, '/agents/5/edit', { id: '5' })).toStrictEqual({
			agent: {
				id: 5,
				owner: OWNER_A,
				wallet: null,
				agentUri: 'data:application/json;base64,e30=',
				name: 'Nova',
				description: 'Weather data',
				image: 'https://img/nova.png',
				services,
				supportedTrust: ['reputation', 'crypto-economic'],
				x402Enabled: true,
				mppEnabled: false,
				rawUriData: uriData
			}
		});
	});

	it('round-trips into the metadata the owner signs, unknown fields kept in their order', async () => {
		const { agent } = await run(editLoad, '/agents/5/edit', { id: '5' });

		expect(JSON.stringify(buildMetadataJsonForEdit(form(agent), agent.rawUriData))).toBe(
			JSON.stringify({
				registrations: uriData.registrations,
				license: 'MIT',
				extra: uriData.extra,
				type: uriData.type,
				name: 'Nova',
				description: 'Weather data',
				image: 'https://img/nova.png',
				services,
				supportedTrust: ['reputation', 'crypto-economic'],
				x402: true
			})
		);
	});

	it('keeps legacy endpoints, and never spreads non-object metadata into fields', async () => {
		await insert('agents', {
			id: 6,
			owner: OWNER_A,
			agent_uri_data: { name: 'Old', endpoints: [{ type: 'MCP', url: 'https://old/mcp' }] }
		});
		const legacy = (await run(editLoad, '/agents/6/edit', { id: '6' })).agent;
		expect(buildMetadataJsonForEdit(form(legacy), legacy.rawUriData)).toEqual({
			type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
			name: 'Old',
			services: [{ name: 'MCP', endpoint: 'https://old/mcp' }]
		});

		await insert('agents', { id: 7, owner: OWNER_A, agent_uri_data: '"just text"' });
		expect((await run(editLoad, '/agents/7/edit', { id: '7' })).agent).toMatchObject({
			name: 'Agent #7',
			rawUriData: {}
		});
	});

	it('rejects bad ids and 404s unknown agents', async () => {
		await expect(run(editLoad, '/agents/x/edit', { id: 'x' })).rejects.toMatchObject({
			status: 400
		});
		await expect(run(editLoad, '/agents/99/edit', { id: '99' })).rejects.toMatchObject({
			status: 404
		});
	});
});

describe('leaderboard', () => {
	it('ranks every agent by score, ties by id, 50 per page', async () => {
		await seedDirectory();
		await insert('agents', { id: 5, owner: OWNER_A });

		const data = await run(leaderboardLoad, '/leaderboard');
		expect(data.leaders.map((leader: Data) => leader.agent_id)).toEqual([2, 1, 3, 5, 4]);
		expect(data.leaders.slice(0, 3)).toStrictEqual([
			{
				agent_id: 2,
				agent_name: 'Price Feed',
				agent_image: null,
				owner: OWNER_B,
				supported_trust: ['crypto-economic'],
				has_services: false,
				feedback_count: 2,
				avg_score: 90,
				unique_clients: 2,
				total_score: 90
			},
			{
				agent_id: 1,
				agent_name: 'Stellar Logo Agent',
				agent_image: 'https://img/1.png',
				owner: OWNER_A,
				supported_trust: ['reputation'],
				has_services: true,
				feedback_count: 1,
				avg_score: 80,
				unique_clients: 1,
				total_score: 80
			},
			{
				agent_id: 3,
				agent_name: null,
				agent_image: null,
				owner: OWNER_A,
				supported_trust: [],
				has_services: false,
				feedback_count: 0,
				avg_score: 0,
				unique_clients: 0,
				total_score: 0
			}
		]);
		// The count is every ranked agent, not the 50 on this page.
		expect(data).toMatchObject({ page: 1, total: 5, hasMore: false, startRank: 1 });
		expect(await run(leaderboardLoad, '/leaderboard?page=2')).toEqual({
			leaders: [],
			page: 2,
			total: 5,
			hasMore: false,
			startRank: 51
		});
		expect((await run(leaderboardLoad, '/leaderboard?page=abc')).page).toBe(1);
	});

	it('pages past 50 and offers no next page when the last page is exactly full', async () => {
		for (let i = 1; i <= 50; i++) await insert('agents', { id: i, owner: OWNER_A });
		expect(await run(leaderboardLoad, '/leaderboard')).toMatchObject({ total: 50, hasMore: false });
		await insert('agents', { id: 51, owner: OWNER_A });
		expect(await run(leaderboardLoad, '/leaderboard')).toMatchObject({ total: 51, hasMore: true });
		const second = await run(leaderboardLoad, '/leaderboard?page=2');
		expect(second).toMatchObject({ total: 51, hasMore: false, startRank: 51 });
		expect(second.leaders).toHaveLength(1);
	});
});

describe('/api/agents/count', () => {
	const get = (query: string, DB: unknown = db) =>
		countAgents({
			url: new URL(`https://stellar8004.com/api/agents/count?${query}`),
			getClientAddress: () => 'client',
			platform: { env: { DB } }
		} as never);

	it('counts the agents an address owns', async () => {
		await seedDirectory();
		const res = await get(`owner=${OWNER_A}`);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('private, max-age=15');
		expect(await res.json()).toEqual({ count: 2 });
		expect(await (await get(`owner=G${'C'.repeat(55)}`)).json()).toEqual({ count: 0 });
	});

	it('applies the rate limiting binding with its own key', async () => {
		await seedDirectory();
		const limit = vi.fn().mockResolvedValue({ success: false });
		const res = await countAgents({
			url: new URL(`https://stellar8004.com/api/agents/count?owner=${OWNER_A}`),
			getClientAddress: () => '203.0.113.7',
			platform: { env: { DB: db, API_RATE_LIMITER: { limit } } }
		} as never);
		expect(res.status).toBe(429);
		expect(limit).toHaveBeenCalledWith({ key: 'count:203.0.113.7' });
	});

	it('rejects malformed owners and reports database failures', async () => {
		const bad = await get('owner=nope');
		expect([bad.status, await bad.json()]).toEqual([400, { count: null }]);

		vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = {
			prepare: () => {
				throw new Error('D1_ERROR');
			}
		};
		const failed = await get(`owner=${OWNER_A}`, broken);
		expect([failed.status, await failed.json()]).toEqual([500, { count: null }]);
	});
});
