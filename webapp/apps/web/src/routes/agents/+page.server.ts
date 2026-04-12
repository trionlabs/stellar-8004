import type { Database } from '@stellar8004/db';
import { createServerSupabase } from '$lib/supabase-server.js';
import { readUriField, assertSuccess } from '$lib/server/utils.js';
import type { PageServerLoad } from './$types';

type SearchAgentRow = Database['public']['Functions']['search_agents']['Returns'][number];
type LeaderboardRow = Database['public']['Views']['leaderboard_scores']['Row'];

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

async function loadScoreMap(
	db: ReturnType<typeof createServerSupabase>,
	agentIds: number[]
): Promise<Map<number, LeaderboardRow>> {
	if (agentIds.length === 0) {
		return new Map();
	}

	const scoreRows =
		assertSuccess(
			await db.from('leaderboard_scores').select('*').in('agent_id', agentIds),
			'Leaderboard scores'
		) ?? [];

	return new Map(
		scoreRows
			.filter((row): row is LeaderboardRow & { agent_id: number } => row.agent_id != null)
			.map((row) => [row.agent_id, row])
	);
}

function normalizeAgentRow(agent: Pick<SearchAgentRow, 'id' | 'owner' | 'agent_uri_data' | 'created_at' | 'supported_trust' | 'services'>, score?: LeaderboardRow | null): AgentListItem {
	return {
		id: agent.id,
		name: readUriField(agent.agent_uri_data, 'name') ?? `Agent #${agent.id}`,
		image: readUriField(agent.agent_uri_data, 'image'),
		owner: agent.owner,
		createdAt: agent.created_at,
		totalScore: score?.total_score ?? null,
		avgScore: score?.avg_score ?? null,
		feedbackCount: score?.feedback_count ?? 0,
		uniqueClients: score?.unique_clients ?? 0,
		supportedTrust: agent.supported_trust ?? [],
		hasServices: Array.isArray(agent.services) ? agent.services.length > 0 : false
	};
}

function normalizeLeaderboardRow(row: LeaderboardRow): AgentListItem | null {
	if (row.agent_id == null || row.owner == null) {
		return null;
	}

	return {
		id: row.agent_id,
		name: row.agent_name ?? `Agent #${row.agent_id}`,
		image: row.agent_image,
		owner: row.owner,
		createdAt: null,
		totalScore: row.total_score,
		avgScore: row.avg_score ?? null,
		feedbackCount: row.feedback_count ?? 0,
		uniqueClients: row.unique_clients ?? 0,
		supportedTrust: row.supported_trust ?? [],
		hasServices: row.has_services ?? false
	};
}

export const load: PageServerLoad = async ({ url }) => {
	const db = createServerSupabase();
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 500);
	const sortParam = url.searchParams.get('sort');
	const sort = SORT_OPTIONS.includes(sortParam as (typeof SORT_OPTIONS)[number])
		? (sortParam as (typeof SORT_OPTIONS)[number])
		: 'created_at';
	const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
	const pageParam = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
	const perPage = 20;
	const offset = (page - 1) * perPage;

	// Advanced filters
	const trustFilter = url.searchParams.getAll('trust').filter((t) => t.length > 0);
	const minScoreParam = Number(url.searchParams.get('min_score') ?? '0');
	const minScore = Number.isFinite(minScoreParam) ? Math.max(0, Math.min(100, minScoreParam)) : 0;
	const hasServicesParam = url.searchParams.get('services');
	const hasServices = hasServicesParam === 'true' ? true : null;

	const ownerFilter = url.searchParams.get('owner')?.trim() ?? '';

	const hasFilters = trustFilter.length > 0 || minScore > 0 || hasServices !== null;

	if (hasFilters) {
		const rpcResult = await db.rpc('search_agents_advanced', {
			search_query: query,
			trust_filter: trustFilter,
			min_score: minScore,
			has_services_filter: hasServices ?? undefined,
			result_limit: perPage,
			result_offset: offset,
			owner_filter: ownerFilter || undefined,
		});

		if (rpcResult.error) {
			console.error('[Advanced search] query failed:', rpcResult.error.message);
			// Fall through to unfiltered listing instead of 500
		} else {
			const advancedRows = rpcResult.data ?? [];

			const agents: AgentListItem[] = advancedRows.map((row) => ({
				id: row.agent_id,
				name: row.agent_name ?? `Agent #${row.agent_id}`,
				image: row.agent_image,
				owner: row.owner,
				createdAt: null,
				totalScore: row.total_score,
				avgScore: row.avg_score ?? null,
				feedbackCount: row.feedback_count ?? 0,
				uniqueClients: row.unique_clients ?? 0,
				supportedTrust: row.supported_trust ?? [],
				hasServices: row.has_services ?? false
			}));

			return {
				agents,
				query,
				sort,
				order,
				page,
				hasMore: advancedRows.length === perPage,
				filters: { trust: trustFilter, minScore, hasServices: hasServices ?? false },
				ownerFilter
			};
		}
	}

	if (query.length > 0) {
		const searchResult = await db.rpc('search_agents', {
			search_query: query,
			result_limit: perPage,
			result_offset: offset,
			owner_filter: ownerFilter || undefined,
		});

		if (!searchResult.error) {
			const searchRows = searchResult.data ?? [];
			const scoreMap = await loadScoreMap(
				db,
				searchRows.map((agent) => agent.id)
			);
			const agents = sortAgents(
				searchRows.map((agent) => normalizeAgentRow(agent, scoreMap.get(agent.id))),
				sort,
				order
			);

			return {
				agents,
				query,
				sort,
				order,
				page,
				hasMore: searchRows.length === perPage,
				filters: { trust: [] as string[], minScore: 0, hasServices: false },
				ownerFilter
			};
		}

		console.error('[Agent search] query failed:', searchResult.error.message);
		// Fall through to unfiltered listing
	}

	if (sort === 'created_at') {
		let agentQuery = db
			.from('agents')
			.select('id, owner, agent_uri_data, created_at, supported_trust, services')
			.order('created_at', { ascending: order === 'asc' })
			.range(offset, offset + perPage - 1);

		if (ownerFilter) {
			agentQuery = agentQuery.eq('owner', ownerFilter);
		}

		const agentRows = assertSuccess(await agentQuery, 'Agent list') ?? [];

		const scoreMap = await loadScoreMap(
			db,
			agentRows.map((agent) => agent.id)
		);

		return {
			agents: agentRows.map((agent) => normalizeAgentRow(agent, scoreMap.get(agent.id))),
			query,
			sort,
			order,
			page,
			hasMore: agentRows.length === perPage,
			filters: { trust: [] as string[], minScore: 0, hasServices: false },
			ownerFilter
		};
	}

	const scoreColumn = sort === 'score' ? 'total_score' : 'feedback_count';

	let lbQuery = db
		.from('leaderboard_scores')
		.select('*')
		.order(scoreColumn, { ascending: order === 'asc' })
		.order('agent_id', { ascending: true })
		.range(offset, offset + perPage - 1);

	if (ownerFilter) {
		lbQuery = lbQuery.eq('owner', ownerFilter);
	}

	const leaderboardRows = assertSuccess(await lbQuery, 'Leaderboard list') ?? [];

	return {
		agents: leaderboardRows
			.map((row) => normalizeLeaderboardRow(row))
			.filter((agent): agent is AgentListItem => agent != null),
		query,
		sort,
		order,
		page,
		hasMore: leaderboardRows.length === perPage,
		filters: { trust: [] as string[], minScore: 0, hasServices: false },
		ownerFilter
	};
};
