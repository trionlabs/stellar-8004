import type { Database } from '@stellar8004/db';
import { error } from '@sveltejs/kit';
import { createServerSupabase } from '$lib/supabase-server.js';
import { readUriField, assertSuccess, toDisplayScore } from '$lib/server/utils.js';
import type { PageServerLoad } from './$types';

type FeedbackResponseRow = Database['public']['Tables']['feedback_responses']['Row'];

function feedbackKey(agentId: number, clientAddress: string, feedbackIndex: number): string {
	return `${agentId}:${clientAddress}:${feedbackIndex}`;
}

function normalizeServices(raw: unknown): Array<{ name: string; endpoint: string; version?: string }> {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((s): s is Record<string, unknown> => s != null && typeof s === 'object')
		.map((s) => ({
			name: typeof s.name === 'string' ? s.name : 'unknown',
			endpoint: typeof s.endpoint === 'string' ? s.endpoint : '',
			version: typeof s.version === 'string' ? s.version : undefined
		}))
		.filter((s) => s.endpoint.length > 0);
}

export const load: PageServerLoad = async ({ params }) => {
	const db = createServerSupabase();
	const agentId = Number(params.id);

	if (!Number.isInteger(agentId) || agentId <= 0) {
		throw error(400, 'Invalid agent ID');
	}

	const [
		agentResult,
		metadataResult,
		feedbackResult,
		validationsResult,
		leaderboardResult,
		responsesResult
	] = await Promise.all([
		db.from('agents').select('*').eq('id', agentId).maybeSingle(),
		db.from('agent_metadata').select('*').eq('agent_id', agentId),
		db
			.from('feedback')
			.select('*')
			.eq('agent_id', agentId)
			.order('created_at', { ascending: false })
			.limit(50),
		db
			.from('validations')
			.select('*')
			.eq('agent_id', agentId)
			.order('created_at', { ascending: false })
			.limit(50),
		db.from('leaderboard_scores').select('*').eq('agent_id', agentId).maybeSingle(),
		db
			.from('feedback_responses')
			.select('*')
			.eq('agent_id', agentId)
			.order('created_at', { ascending: false })
			.limit(200)
	]);

	const agent = assertSuccess(agentResult, 'Agent');
	const metadataRows = assertSuccess(metadataResult, 'Metadata') ?? [];
	const feedbackRows = assertSuccess(feedbackResult, 'Feedback') ?? [];
	const validationRows = assertSuccess(validationsResult, 'Validations') ?? [];
	const leaderboard = assertSuccess(leaderboardResult, 'Leaderboard');
	const responseRows = assertSuccess(
		responsesResult,
		'Feedback responses'
	) as FeedbackResponseRow[];

	if (!agent) {
		throw error(404, 'Agent not found');
	}

	const responsesByFeedback = new Map<string, FeedbackResponseRow[]>();

	for (const response of responseRows) {
		const key = feedbackKey(response.agent_id, response.client_address, response.feedback_index);
		const entries = responsesByFeedback.get(key) ?? [];

		entries.push(response);
		responsesByFeedback.set(key, entries);
	}

	return {
		agent: {
			id: agent.id,
			name: readUriField(agent.agent_uri_data, 'name') ?? `Agent #${agent.id}`,
			description: readUriField(agent.agent_uri_data, 'description'),
			image: readUriField(agent.agent_uri_data, 'image'),
			owner: agent.owner,
			wallet: agent.wallet,
			agentUri: agent.agent_uri,
			supportedTrust: agent.supported_trust ?? [],
			services: normalizeServices(agent.services),
			createdAt: agent.created_at,
			updatedAt: agent.updated_at,
			registrationData: agent.agent_uri_data ? JSON.stringify(agent.agent_uri_data, null, 2) : null
		},
		metadata: metadataRows,
		feedback: feedbackRows.map((feedback) => ({
			id: feedback.id,
			clientAddress: feedback.client_address,
			score: toDisplayScore(feedback.value, feedback.value_decimals),
			tag1: feedback.tag1,
			tag2: feedback.tag2,
			feedbackUri: feedback.feedback_uri,
			feedbackHash: feedback.feedback_hash,
			isRevoked: feedback.is_revoked,
			createdAt: feedback.created_at,
			responses: (
				responsesByFeedback.get(
					feedbackKey(feedback.agent_id, feedback.client_address, feedback.feedback_index)
				) ?? []
			).map((response) => ({
				id: response.id,
				responder: response.responder,
				responseUri: response.response_uri,
				createdAt: response.created_at
			}))
		})),
		validations: validationRows.map((validation) => ({
			validatorAddress: validation.validator_address,
			tag: validation.tag,
			hasResponse: validation.has_response,
			score: validation.response,
			requestUri: validation.request_uri,
			responseUri: validation.response_uri,
			createdAt: validation.created_at,
			respondedAt: validation.responded_at
		})),
		scores: leaderboard
			? {
					totalScore: leaderboard.total_score,
					avgScore: leaderboard.avg_score,
					feedbackCount: leaderboard.feedback_count ?? 0,
					uniqueClients: leaderboard.unique_clients ?? 0,
					validationCount: leaderboard.validation_count ?? 0,
					avgValidationScore: leaderboard.avg_validation_score
				}
			: null
	};
};
