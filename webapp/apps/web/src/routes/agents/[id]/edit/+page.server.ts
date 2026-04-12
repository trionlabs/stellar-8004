import { error } from '@sveltejs/kit';
import { createServerSupabase } from '$lib/supabase-server.js';
import { readUriField, assertSuccess } from '$lib/server/utils.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = createServerSupabase();
	const agentId = Number(params.id);

	if (!Number.isInteger(agentId) || agentId < 0 || agentId > 2_147_483_647) {
		throw error(400, 'Invalid agent ID');
	}

	const agentResult = await db.from('agents').select('*').eq('id', agentId).maybeSingle();
	const agent = assertSuccess(agentResult, 'Agent');

	if (!agent) {
		throw error(404, 'Agent not found');
	}

	const parsedUriData = agent.agent_uri_data && !Array.isArray(agent.agent_uri_data)
		? agent.agent_uri_data as Record<string, unknown>
		: {};

	return {
		agent: {
			id: agent.id,
			owner: agent.owner,
			wallet: agent.wallet,
			agentUri: agent.agent_uri,
			name: readUriField(agent.agent_uri_data, 'name') ?? `Agent #${agent.id}`,
			description: readUriField(agent.agent_uri_data, 'description'),
			image: readUriField(agent.agent_uri_data, 'image'),
			services: agent.services ?? [],
			supportedTrust: agent.supported_trust ?? [],
			x402Enabled: agent.x402_enabled ?? false,
			rawUriData: parsedUriData
		}
	};
};
