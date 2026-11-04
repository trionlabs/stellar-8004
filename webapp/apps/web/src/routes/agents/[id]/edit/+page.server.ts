import { error } from '@sveltejs/kit';
import { decodeRow, getDb } from '$lib/server/d1.js';
import { readUriField, type AgentRow } from '$lib/server/utils.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const agentId = Number(params.id);

	if (!Number.isInteger(agentId) || agentId < 0 || agentId > 2_147_483_647) {
		throw error(400, 'Invalid agent ID');
	}

	const row = await getDb(platform)
		.prepare('SELECT * FROM agents WHERE id = ?')
		.bind(agentId)
		.first();

	if (!row) {
		throw error(404, 'Agent not found');
	}

	const agent = decodeRow<AgentRow>(row);
	// Only a JSON object can be merged into the new metadata; a string here would spread
	// into "0", "1", ... fields.
	const uriData = agent.agent_uri_data;
	const parsedUriData =
		uriData && typeof uriData === 'object' && !Array.isArray(uriData)
			? (uriData as Record<string, unknown>)
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
			mppEnabled: agent.mpp_enabled ?? false,
			rawUriData: parsedUriData
		}
	};
};
