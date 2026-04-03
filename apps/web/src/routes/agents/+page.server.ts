import type { Database } from '@stellar8004/db';
import { error } from '@sveltejs/kit';
import { createServerSupabase } from '$lib/supabase-server.js';
import type { PageServerLoad } from './$types';

type AgentUriData = Database['public']['Tables']['agents']['Row']['agent_uri_data'];
type SearchAgentRow = Database['public']['Functions']['search_agents']['Returns'][number];
type LeaderboardRow = Database['public']['Views']['leaderboard_scores']['Row'];

type AgentListItem = {
	id: number;
	name: string;
	image: string | null;
	owner: string;
	createdAt: string | null;
	totalScore: number | null;
	feedbackCount: number;
	validationCount: number;
	uniqueClients: number;
};

const SORT_OPTIONS = ['created_at', 'score', 'feedback'] as const;

function readUriField(source: AgentUriData, field: string): string | null {
	if (!source || Array.isArray(source) || typeof source !== 'object') {
		return null;
	}

	const value = source[field];

	return typeof value === 'string' && value.length > 0 ? value : null;
}

function assertSuccess<T>(
	result: { data: T; error: { message: string } | null },
	label: string
): T {
	if (result.error) {
		throw error(500, `${label} query failed: ${result.error.message}`);
	}

	return result.data;
}

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

function normalizeAgentRow(agent: SearchAgentRow, score?: LeaderboardRow | null): AgentListItem {
	return {
		id: agent.id,
		name: readUriField(agent.agent_uri_data, 'name') ?? `Agent #${agent.id}`,
		image: readUriField(agent.agent_uri_data, 'image'),
		owner: agent.owner,
		createdAt: agent.created_at,
		totalScore: score?.total_score ?? null,
		feedbackCount: score?.feedback_count ?? 0,
		validationCount: score?.validation_count ?? 0,
		uniqueClients: score?.unique_clients ?? 0
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
		feedbackCount: row.feedback_count ?? 0,
		validationCount: row.validation_count ?? 0,
		uniqueClients: row.unique_clients ?? 0
	};
}

export const load: PageServerLoad = async ({ url }) => {
	const db = createServerSupabase();
	const query = url.searchParams.get('q')?.trim() ?? '';
	const sortParam = url.searchParams.get('sort');
	const sort = SORT_OPTIONS.includes(sortParam as (typeof SORT_OPTIONS)[number])
		? (sortParam as (typeof SORT_OPTIONS)[number])
		: 'created_at';
	const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
	const pageParam = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
	const perPage = 20;
	const offset = (page - 1) * perPage;

	if (query.length > 0) {
		const searchRows =
			assertSuccess(
				await db.rpc('search_agents', {
					search_query: query,
					result_limit: perPage,
					result_offset: offset
				}),
				'Agent search'
			) ?? [];

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
			hasMore: searchRows.length === perPage
		};
	}

	if (sort === 'created_at') {
		const agentRows =
			assertSuccess(
				await db
					.from('agents')
					.select(
						'id, owner, agent_uri_data, created_at, agent_uri, created_ledger, tx_hash, updated_at, wallet, search_vector'
					)
					.order('created_at', { ascending: order === 'asc' })
					.range(offset, offset + perPage - 1),
				'Agent list'
			) ?? [];

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
			hasMore: agentRows.length === perPage
		};
	}

	const scoreColumn = sort === 'score' ? 'total_score' : 'feedback_count';
	const leaderboardRows =
		assertSuccess(
			await db
				.from('leaderboard_scores')
				.select('*')
				.order(scoreColumn, { ascending: order === 'asc' })
				.order('agent_id', { ascending: true })
				.range(offset, offset + perPage - 1),
			'Leaderboard list'
		) ?? [];

	return {
		agents: leaderboardRows
			.map((row) => normalizeLeaderboardRow(row))
			.filter((agent): agent is AgentListItem => agent != null),
		query,
		sort,
		order,
		page,
		hasMore: leaderboardRows.length === perPage
	};
};
