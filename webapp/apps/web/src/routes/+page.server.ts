import { decodeRow, getDb } from '$lib/server/d1.js';
import { readUriField, toDisplayScore } from '$lib/server/utils.js';
import type { PageServerLoad } from './$types';

type Stats = { agents: number; feedback: number; clients: number };
type RecentAgent = { id: number; agent_uri_data: unknown; created_at: string };
type RecentFeedback = {
	id: number;
	agent_id: number;
	client_address: string;
	value: string;
	value_decimals: number;
	tag1: string | null;
	created_at: string;
	agent_uri_data: unknown;
};

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform);

	const [statsResult, recentAgentsResult, recentFeedbackResult] = await db.batch([
		db.prepare(
			`SELECT (SELECT COUNT(*) FROM agents) AS agents,
			        (SELECT COUNT(*) FROM feedback WHERE is_revoked = 0) AS feedback,
			        (SELECT COALESCE(SUM(unique_clients), 0) FROM leaderboard_scores) AS clients`
		),
		db.prepare(
			'SELECT id, agent_uri_data, created_at FROM agents ORDER BY created_at DESC, id DESC LIMIT 10'
		),
		db.prepare(
			`SELECT f.id, f.agent_id, f.client_address, f.value, f.value_decimals, f.tag1, f.created_at,
			        a.agent_uri_data
			 FROM feedback f LEFT JOIN agents a ON a.id = f.agent_id
			 WHERE f.is_revoked = 0
			 ORDER BY f.created_at DESC, f.id DESC
			 LIMIT 10`
		)
	]);

	const stats = statsResult.results[0] as Stats;
	const recentAgentRows = recentAgentsResult.results.map(decodeRow<RecentAgent>);
	const recentFeedbackRows = recentFeedbackResult.results.map(decodeRow<RecentFeedback>);

	return {
		stats: {
			totalAgents: stats.agents,
			totalFeedback: stats.feedback,
			totalClients: stats.clients
		},
		recentAgents: recentAgentRows.map((agent) => ({
			id: agent.id,
			name: readUriField(agent.agent_uri_data, 'name') ?? `Agent #${agent.id}`,
			createdAt: agent.created_at
		})),
		recentFeedback: recentFeedbackRows.map((feedback) => ({
			id: feedback.id,
			agentId: feedback.agent_id,
			agentName: readUriField(feedback.agent_uri_data, 'name') ?? `Agent #${feedback.agent_id}`,
			clientAddress: feedback.client_address,
			score: toDisplayScore(feedback.value, feedback.value_decimals),
			tag: feedback.tag1,
			createdAt: feedback.created_at
		}))
	};
};
