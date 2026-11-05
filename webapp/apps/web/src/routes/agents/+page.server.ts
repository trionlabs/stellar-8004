import { decodeRow, getDb } from '$lib/server/d1.js';
import { ftsMatch } from '$lib/server/search.js';
import { readUriField, type ScoreRow } from '$lib/server/utils.js';
import type { PageServerLoad } from './$types';

type AgentListItem = {
	id: number;
	name: string;
	image: string | null;
	owner: string;
	createdAt: string | null;
	totalScore: number | null;
	avgScore: number | null;
	feedbackCount: number;
	uniqueClients: number;
	supportedTrust: string[];
	hasServices: boolean;
};

/** An agents row with its leaderboard_scores numbers (AGENT_COLUMNS), after decodeRow. */
type AgentScoreRow = {
	id: number;
	owner: string;
	agent_uri_data: unknown;
	created_at: string;
	supported_trust: string[];
	services: unknown[];
	total_score: number;
	avg_score: number;
	feedback_count: number;
	unique_clients: number;
};

const AGENT_COLUMNS =
	'a.id, a.owner, a.agent_uri_data, a.created_at, a.supported_trust, a.services, ' +
	'ls.total_score, ls.avg_score, ls.feedback_count, ls.unique_clients';

const SORT_OPTIONS = ['created_at', 'score', 'feedback'] as const;

function compareNullableNumbers(
	left: number | null,
	right: number | null,
	order: 'asc' | 'desc'
): number {
	if (left == null && right == null) return 0;
	if (left == null) return 1;
	if (right == null) return -1;

	return order === 'asc' ? left - right : right - left;
}

function sortAgents(
	agents: AgentListItem[],
	sort: (typeof SORT_OPTIONS)[number],
	order: 'asc' | 'desc'
): AgentListItem[] {
	return [...agents].sort((left, right) => {
		if (sort === 'score') {
			return compareNullableNumbers(left.totalScore, right.totalScore, order) || left.id - right.id;
		}

		if (sort === 'feedback') {
			return (
				(order === 'asc'
					? left.feedbackCount - right.feedbackCount
					: right.feedbackCount - left.feedbackCount) || left.id - right.id
			);
		}

		const leftDate = left.createdAt ? Date.parse(left.createdAt) : 0;
		const rightDate = right.createdAt ? Date.parse(right.createdAt) : 0;

		return (order === 'asc' ? leftDate - rightDate : rightDate - leftDate) || left.id - right.id;
	});
}

function normalizeAgentRow(agent: AgentScoreRow): AgentListItem {
	return {
		id: agent.id,
		name: readUriField(agent.agent_uri_data, 'name') ?? `Agent #${agent.id}`,
		image: readUriField(agent.agent_uri_data, 'image'),
		owner: agent.owner,
		createdAt: agent.created_at,
		totalScore: agent.total_score,
		avgScore: agent.avg_score,
		feedbackCount: agent.feedback_count,
		uniqueClients: agent.unique_clients,
		supportedTrust: agent.supported_trust,
		hasServices: agent.services.length > 0
	};
}

function normalizeLeaderboardRow(row: ScoreRow): AgentListItem {
	return {
		id: row.agent_id,
		name: row.agent_name ?? `Agent #${row.agent_id}`,
		image: row.agent_image,
		owner: row.owner,
		createdAt: null,
		totalScore: row.total_score,
		avgScore: row.avg_score,
		feedbackCount: row.feedback_count,
		uniqueClients: row.unique_clients,
		supportedTrust: row.supported_trust,
		hasServices: row.has_services
	};
}

export const load: PageServerLoad = async ({ url, platform }) => {
	const db = getDb(platform);
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 500);
	const sortParam = url.searchParams.get('sort');
	const sort = SORT_OPTIONS.includes(sortParam as (typeof SORT_OPTIONS)[number])
		? (sortParam as (typeof SORT_OPTIONS)[number])
		: 'created_at';
	const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
	const direction = order === 'asc' ? 'ASC' : 'DESC';
	const pageParam = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
	const perPage = 20;
	const offset = (page - 1) * perPage;

	// Advanced filters
	const trustFilter = url.searchParams.getAll('trust').filter((t) => t.length > 0);
	const minScoreParam = Number(url.searchParams.get('min_score') ?? '0');
	const minScore = Number.isFinite(minScoreParam) ? Math.max(0, Math.min(100, minScoreParam)) : 0;
	const hasServices = url.searchParams.get('services') === 'true';

	const ownerFilter = url.searchParams.get('owner')?.trim() ?? '';
	const owner = ownerFilter || null;

	// FTS5 MATCH expression for the query; null without a query or a searchable word in it.
	const match = ftsMatch(query);

	// Each branch is one FROM/WHERE: the page reads LIMIT rows from it and counts all of it.
	let source: { from: string; binds: unknown[]; select: string; orderBy: string } | null;
	let toItems: (rows: Record<string, unknown>[]) => AgentListItem[];

	if (query && !match) {
		source = null; // only stopwords or punctuation: plainto_tsquery matched nothing either
		toItems = () => [];
	} else if (trustFilter.length > 0 || minScore > 0 || hasServices) {
		// search_agents_advanced: every filter applies, the text query only when there is one.
		source = {
			from: `leaderboard_scores ls
			 WHERE (?1 IS NULL OR ls.agent_id IN (SELECT rowid FROM agents_fts WHERE agents_fts MATCH ?1))
			   AND (?2 IS NULL OR EXISTS (
			         SELECT 1 FROM json_each(ls.supported_trust) AS t
			         WHERE t.value IN (SELECT value FROM json_each(?2))))
			   AND ls.total_score >= ?3
			   AND (?4 = 0 OR ls.has_services)
			   AND (?5 IS NULL OR ls.owner = ?5)`,
			binds: [
				match,
				trustFilter.length > 0 ? JSON.stringify(trustFilter) : null,
				minScore,
				hasServices,
				owner
			],
			select: 'ls.*',
			orderBy: 'ls.total_score DESC, ls.agent_id'
		};
		toItems = (rows) => rows.map(decodeRow<ScoreRow>).map(normalizeLeaderboardRow);
	} else if (query) {
		// search_agents: the most relevant matches, then shown in the chosen sort order.
		source = {
			from: `agents_fts
			 JOIN agents a ON a.id = agents_fts.rowid
			 JOIN leaderboard_scores ls ON ls.agent_id = a.id
			 WHERE agents_fts MATCH ?1 AND (?2 IS NULL OR a.owner = ?2)`,
			binds: [match, owner],
			select: AGENT_COLUMNS,
			orderBy: 'agents_fts.rank, a.id'
		};
		toItems = (rows) =>
			sortAgents(rows.map(decodeRow<AgentScoreRow>).map(normalizeAgentRow), sort, order);
	} else if (sort === 'created_at') {
		source = {
			from: `agents a JOIN leaderboard_scores ls ON ls.agent_id = a.id
			 WHERE ?1 IS NULL OR a.owner = ?1`,
			binds: [owner],
			select: AGENT_COLUMNS,
			orderBy: `a.created_at ${direction}, a.id`
		};
		toItems = (rows) => rows.map(decodeRow<AgentScoreRow>).map(normalizeAgentRow);
	} else {
		const column = sort === 'score' ? 'total_score' : 'feedback_count';
		source = {
			from: 'leaderboard_scores WHERE ?1 IS NULL OR owner = ?1',
			binds: [owner],
			select: '*',
			orderBy: `${column} ${direction}, agent_id`
		};
		toItems = (rows) => rows.map(decodeRow<ScoreRow>).map(normalizeLeaderboardRow);
	}

	let agents: AgentListItem[] = [];
	let total = 0;
	if (source) {
		const n = source.binds.length;
		const [list, count] = await db.batch([
			db
				.prepare(
					`SELECT ${source.select} FROM ${source.from}
					 ORDER BY ${source.orderBy} LIMIT ?${n + 1} OFFSET ?${n + 2}`
				)
				.bind(...source.binds, perPage, offset),
			db.prepare(`SELECT COUNT(*) AS n FROM ${source.from}`).bind(...source.binds)
		]);
		agents = toItems(list.results);
		total = Number((count.results[0] as { n: number }).n);
	}

	return {
		agents,
		query,
		sort,
		order,
		page,
		total,
		hasMore: offset + agents.length < total,
		filters: { trust: trustFilter, minScore, hasServices },
		ownerFilter
	};
};
