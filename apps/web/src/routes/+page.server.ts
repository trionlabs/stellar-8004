import type { Database } from '@stellar8004/db';
import { error } from '@sveltejs/kit';
import { createServerSupabase } from '$lib/supabase-server.js';
import type { PageServerLoad } from './$types';

type AgentUriData = Database['public']['Tables']['agents']['Row']['agent_uri_data'];

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

function toDisplayScore(value: string | number | null, decimals: number): number {
	// Display-only conversion for v1. Reputation scores are expected to stay in a small range.
	return Number(value ?? 0) / Math.pow(10, decimals);
}

export const load: PageServerLoad = async () => {
	const db = createServerSupabase();

	const [
		agentsCountResult,
		feedbackCountResult,
		uniqueClientsResult,
		recentAgentsResult,
		recentFeedbackResult
	] = await Promise.all([
		db.from('agents').select('id', { count: 'exact', head: true }),
		db.from('feedback').select('id', { count: 'exact', head: true }).eq('is_revoked', false),
		db.from('leaderboard_scores').select('unique_clients'),
		db
			.from('agents')
			.select('id, agent_uri_data, created_at')
			.order('created_at', { ascending: false })
			.limit(10),
		db
			.from('feedback')
			.select(
				'id, agent_id, client_address, value, value_decimals, tag1, created_at, agent:agents!feedback_agent_id_fkey(agent_uri_data)'
			)
			.eq('is_revoked', false)
			.order('created_at', { ascending: false })
			.limit(10)
	]);

	assertSuccess(agentsCountResult, 'Agents count');
	assertSuccess(feedbackCountResult, 'Feedback count');

	const uniqueClientsRows = assertSuccess(uniqueClientsResult, 'Unique clients') ?? [];
	const recentAgentRows = assertSuccess(recentAgentsResult, 'Recent agents') ?? [];
	const recentFeedbackRows = (assertSuccess(recentFeedbackResult, 'Recent feedback') ??
		[]) as Array<{
		id: number;
		agent_id: number;
		client_address: string;
		value: string | number | null;
		value_decimals: number;
		tag1: string | null;
		created_at: string;
		agent: { agent_uri_data: AgentUriData } | { agent_uri_data: AgentUriData }[] | null;
	}>;

	return {
		stats: {
			totalAgents: agentsCountResult.count ?? 0,
			totalFeedback: feedbackCountResult.count ?? 0,
			totalClients: uniqueClientsRows.reduce((sum, row) => sum + (row.unique_clients ?? 0), 0)
		},
		recentAgents: recentAgentRows.map((agent) => ({
			id: agent.id,
			name: readUriField(agent.agent_uri_data, 'name') ?? `Agent #${agent.id}`,
			createdAt: agent.created_at
		})),
		recentFeedback: recentFeedbackRows.map((feedback) => {
			const agentRecord = Array.isArray(feedback.agent) ? feedback.agent[0] : feedback.agent;

			return {
				id: feedback.id,
				agentId: feedback.agent_id,
				agentName:
					readUriField(agentRecord?.agent_uri_data ?? null, 'name') ??
					`Agent #${feedback.agent_id}`,
				clientAddress: feedback.client_address,
				score: toDisplayScore(feedback.value, feedback.value_decimals),
				tag: feedback.tag1,
				createdAt: feedback.created_at
			};
		})
	};
};
