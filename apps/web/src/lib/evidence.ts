export interface FeedbackEvidence {
	agentRegistry: string;
	agentId: number;
	clientAddress: string;
	createdAt: string;
	score: number;
	tag: string;
	context: string;
}

export function buildFeedbackEvidence(params: {
	agentId: number;
	clientAddress: string;
	value: number;
	tag1: string;
	registryContract: string;
}): FeedbackEvidence {
	return {
		agentRegistry: `stellar:testnet:${params.registryContract}`,
		agentId: params.agentId,
		clientAddress: params.clientAddress,
		createdAt: new Date().toISOString(),
		score: params.value,
		tag: params.tag1,
		context: 'Feedback submitted via 8004scan Stellar explorer'
	};
}

export async function sha256Hash(content: string): Promise<Uint8Array> {
	const encoded = new TextEncoder().encode(content);
	const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
	return new Uint8Array(hashBuffer);
}
