// Port of supabase/functions/api/handlers/*.ts onto D1. Each request runs its queries in
// one db.batch(); scores come from the live leaderboard_scores view.
import { isValidStellarAddress } from '@trionlabs/stellar8004';
import { env } from '$env/dynamic/public';
import { decodeRow, type Db } from '$lib/server/d1.js';
import { ftsMatch } from '$lib/server/search.js';
import {
	errorResponse,
	formatAgent,
	formatAgentDetail,
	paginate,
	parseIntParam,
	successWithCache
} from './response.js';

type Row = Record<string, unknown>;

// Agents with their scores; the view has a row for every agent.
const AGENTS = `SELECT a.id, a.owner, a.wallet, a.agent_uri, a.agent_uri_data, a.supported_trust,
	a.x402_enabled, a.mpp_enabled, a.services, a.created_at, a.created_ledger, a.tx_hash,
	s.total_score, s.avg_score, s.feedback_count, s.unique_clients
	FROM agents a LEFT JOIN leaderboard_scores s ON s.agent_id = a.id`;
const FTS_MATCH = 'a.id IN (SELECT rowid FROM agents_fts WHERE agents_fts MATCH ?)';
// supported_trust shares a value with the bound JSON array (Postgres &&).
const TRUST_OVERLAP =
	'EXISTS (SELECT 1 FROM json_each(a.supported_trust) t WHERE t.value IN (SELECT value FROM json_each(?)))';

// PostgREST sent /agents' trust list as an array literal, which trims each value.
const trustValues = (trust: string) => JSON.stringify(trust.split(',').map((t) => t.trim()));
const decoded = (rows: Row[]) => rows.map((row) => decodeRow<Row>(row));

function pageParams(url: URL) {
	const page = parseIntParam(url.searchParams.get('page'), 1, 1, 10000);
	const limit = parseIntParam(url.searchParams.get('limit'), 20, 1, 100);
	return { page, limit, offset: (page - 1) * limit };
}

function orderBy(url: URL): string {
	const column = url.searchParams.get('sortBy') === 'id' ? 'id' : 'created_at';
	const direction = url.searchParams.get('sortOrder') === 'asc' ? 'ASC' : 'DESC';
	return `ORDER BY a.${column} ${direction}, a.id ${direction}`;
}

export async function handleAgentsList(db: Db, url: URL): Promise<Response> {
	const { page, limit, offset } = pageParams(url);
	const params = url.searchParams;
	const search = params.get('search') ?? '';
	const trust = params.get('trust') ?? '';
	const minScore = parseFloat(params.get('minScore') ?? '');
	const where: string[] = [];
	const args: unknown[] = [];

	if (search) {
		const match = ftsMatch(search);
		// Only stopwords: plainto_tsquery matched nothing, and neither does this.
		if (match === null) {
			return successWithCache([], 30, 120, { pagination: paginate(0, page, limit) });
		}
		where.push(FTS_MATCH);
		args.push(match);
	}
	if (trust) {
		where.push(TRUST_OVERLAP);
		args.push(trustValues(trust));
	}
	if (minScore > 0) {
		where.push('a.id IN (SELECT agent_id FROM leaderboard_scores WHERE total_score >= ?)');
		args.push(minScore);
	}
	if (params.get('hasServices') === 'true') where.push('json_array_length(a.services) > 0');
	if (params.get('x402') === 'true') where.push('a.x402_enabled = 1');
	if (params.get('mpp') === 'true') where.push('a.mpp_enabled = 1');

	const filter = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
	const [count, agents] = await db.batch([
		db.prepare(`SELECT COUNT(*) AS n FROM agents a ${filter}`).bind(...args),
		db.prepare(`${AGENTS} ${filter} ${orderBy(url)} LIMIT ? OFFSET ?`).bind(...args, limit, offset)
	]);
	const items = decoded(agents.results).map((agent) => formatAgent(agent, agent));
	const total = Number(count.results[0].n);
	return successWithCache(items, 30, 120, { pagination: paginate(total, page, limit) });
}

export async function handleAgentDetail(db: Db, id: string): Promise<Response> {
	const agentId = parseInt(id, 10);
	if (isNaN(agentId)) return errorResponse('INVALID_ID', 'Agent ID must be a number', 400);

	const [agent, metadata] = await db.batch([
		db.prepare(`${AGENTS} WHERE a.id = ?`).bind(agentId),
		db
			.prepare('SELECT key, value FROM agent_metadata WHERE agent_id = ? ORDER BY key')
			.bind(agentId)
	]);
	const [row] = decoded(agent.results);
	if (!row) return errorResponse('NOT_FOUND', 'Agent not found', 404);
	return successWithCache(formatAgentDetail(row, row, metadata.results), 30, 120);
}

export async function handleAgentFeedback(db: Db, id: string, url: URL): Promise<Response> {
	const agentId = parseInt(id, 10);
	if (isNaN(agentId)) return errorResponse('INVALID_ID', 'Agent ID must be a number', 400);

	const { page, limit, offset } = pageParams(url);
	const tag = url.searchParams.get('tag') ?? '';
	const filter = tag ? 'agent_id = ? AND tag1 = ?' : 'agent_id = ?';
	const args = tag ? [agentId, tag] : [agentId];
	// Newest first, revoked feedback included.
	const pageSql = `SELECT * FROM feedback WHERE ${filter} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
	const [count, feedback, responses] = await db.batch([
		db.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE ${filter}`).bind(...args),
		db.prepare(pageSql).bind(...args, limit, offset),
		db
			.prepare(
				`SELECT r.* FROM feedback_responses r
				JOIN (${pageSql}) f USING (agent_id, client_address, feedback_index)
				ORDER BY r.created_at DESC, r.id DESC`
			)
			.bind(...args, limit, offset)
	]);

	const key = (row: Row) => `${row.client_address}:${row.feedback_index}`;
	const replies = Map.groupBy(responses.results, key);
	const items = decoded(feedback.results).map((f) => ({
		feedbackIndex: f.feedback_index,
		clientAddress: f.client_address,
		value: Number(f.value),
		valueDecimals: f.value_decimals,
		tag1: f.tag1,
		tag2: f.tag2,
		endpoint: f.endpoint,
		feedbackUri: f.feedback_uri,
		isRevoked: f.is_revoked,
		createdAt: f.created_at,
		responses: (replies.get(key(f)) ?? []).map((r) => ({
			responder: r.responder,
			responseUri: r.response_uri,
			createdAt: r.created_at
		}))
	}));
	const total = Number(count.results[0].n);
	return successWithCache(items, 60, 300, { pagination: paginate(total, page, limit) });
}

export async function handleAccounts(db: Db, address: string, url: URL): Promise<Response> {
	if (!isValidStellarAddress(address)) {
		return errorResponse('INVALID_ADDRESS', 'Invalid Stellar address', 400);
	}

	const { page, limit, offset } = pageParams(url);
	const [count, agents] = await db.batch([
		db.prepare('SELECT COUNT(*) AS n FROM agents WHERE owner = ?').bind(address),
		db
			.prepare(`${AGENTS} WHERE a.owner = ? ${orderBy(url)} LIMIT ? OFFSET ?`)
			.bind(address, limit, offset)
	]);
	const items = decoded(agents.results).map((agent) => formatAgent(agent, agent));
	const total = Number(count.results[0].n);
	return successWithCache(items, 30, 120, { pagination: paginate(total, page, limit) });
}

export async function handleSearch(db: Db, url: URL): Promise<Response> {
	const q = url.searchParams.get('q');
	if (!q || q.trim().length === 0) {
		return errorResponse('MISSING_PARAM', 'Query parameter "q" is required', 400);
	}

	const limit = parseIntParam(url.searchParams.get('limit'), 20, 1, 100);
	const trust = url.searchParams.get('trust') ?? '';
	// search_agents_advanced clamped min_score to >= 0 (NaN and Infinity reached it as null),
	// so negative scores never showed up in search.
	const minScore = parseFloat(url.searchParams.get('minScore') ?? '');
	const match = ftsMatch(q);
	if (match === null) return successWithCache([], 30, 120);

	const where = [FTS_MATCH, 's.total_score >= ?'];
	const args: unknown[] = [match, Number.isFinite(minScore) ? Math.max(minScore, 0) : 0];
	if (trust) {
		where.push(TRUST_OVERLAP);
		args.push(trustValues(trust));
	}
	const { results } = await db
		.prepare(
			`SELECT s.agent_id, s.agent_name, s.agent_image, s.owner, s.supported_trust, s.has_services,
				a.x402_enabled, a.mpp_enabled, s.total_score, s.avg_score, s.feedback_count, s.unique_clients
			FROM leaderboard_scores s JOIN agents a ON a.id = s.agent_id
			WHERE ${where.join(' AND ')}
			ORDER BY s.total_score DESC, s.agent_id ASC LIMIT ?`
		)
		.bind(...args, limit)
		.all();

	const items = decoded(results).map((row) => ({
		id: row.agent_id,
		name: row.agent_name,
		image: row.agent_image,
		owner: row.owner,
		supportedTrust: row.supported_trust ?? [],
		hasServices: row.has_services ?? false,
		x402Enabled: row.x402_enabled ?? false,
		mppEnabled: row.mpp_enabled ?? false,
		totalScore: row.total_score ?? 0,
		avgScore: row.avg_score ?? 0,
		feedbackCount: row.feedback_count ?? 0,
		uniqueClients: row.unique_clients ?? 0
	}));
	return successWithCache(items, 30, 120);
}

export async function handleStats(db: Db): Promise<Response> {
	// Service names and trust values are counted per entry, case-insensitively, as before.
	const s = (await db
		.prepare(
			`SELECT
				(SELECT COUNT(*) FROM agents) AS agents,
				(SELECT COUNT(*) FROM feedback) AS feedbacks,
				(SELECT COUNT(*) FROM validations) AS validations,
				(SELECT COUNT(*) FROM agents WHERE json_array_length(services) > 0) AS with_services,
				(SELECT COUNT(*) FROM agents WHERE x402_enabled = 1) AS with_x402,
				(SELECT COUNT(*) FROM agents WHERE mpp_enabled = 1) AS with_mpp,
				scores.*, protocols.*, trust.*
			FROM
				(SELECT SUM(unique_clients) AS clients, AVG(avg_score) AS avg_score FROM leaderboard_scores) scores,
				(SELECT COUNT(*) FILTER (WHERE name = 'a2a') AS a2a, COUNT(*) FILTER (WHERE name = 'mcp') AS mcp,
					COUNT(*) FILTER (WHERE name IS NOT 'a2a' AND name IS NOT 'mcp') AS other
				FROM (SELECT lower(CASE svc.type WHEN 'object' THEN svc.value ->> '$.name' END) AS name
					FROM agents, json_each(agents.services) svc)) protocols,
				(SELECT COUNT(*) FILTER (WHERE name = 'reputation') AS reputation,
					COUNT(*) FILTER (WHERE name = 'validation') AS validation,
					COUNT(*) FILTER (WHERE name IN ('tee-attestation', 'tee')) AS tee
				FROM (SELECT lower(tr.value) AS name FROM agents, json_each(agents.supported_trust) tr)) trust`
		)
		.first<Record<string, number | null>>())!;

	return successWithCache(
		{
			totalAgents: s.agents,
			totalFeedbacks: s.feedbacks,
			totalValidations: s.validations,
			totalUniqueClients: s.clients ?? 0,
			averageFeedbackScore: Math.round((s.avg_score ?? 0) * 10) / 10,
			agentsWithServices: s.with_services,
			agentsWithX402: s.with_x402,
			agentsWithMpp: s.with_mpp,
			network: env.PUBLIC_STELLAR_NETWORK,
			protocolDistribution: { a2a: s.a2a, mcp: s.mcp, other: s.other },
			trustDistribution: { reputation: s.reputation, validation: s.validation, tee: s.tee }
		},
		60,
		300
	);
}

const STALE_AFTER_MS = 5 * 60_000;

export async function handleHealth(db: Db): Promise<Response> {
	const { results } = await db
		.prepare('SELECT id, last_ledger, updated_at, last_advanced_at FROM indexer_state')
		.all();
	const now = Date.now();
	const check = (id: string) => {
		const row = results.find((r) => r.id === id);
		if (!row) return { lastLedger: 0, stale: true };
		// Staleness tracks forward progress (last_advanced_at), not mere run activity (updated_at).
		const progressAt = new Date((row.last_advanced_at ?? row.updated_at) as string).getTime();
		return { lastLedger: row.last_ledger ?? 0, stale: now - progressAt > STALE_AFTER_MS };
	};
	const indexer = {
		identity: check('identity'),
		reputation: check('reputation'),
		validation: check('validation')
	};
	const status = Object.values(indexer).some((contract) => contract.stale) ? 'degraded' : 'healthy';
	return successWithCache({ status, indexer, network: env.PUBLIC_STELLAR_NETWORK }, 10, 30);
}
