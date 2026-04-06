export interface ServiceEntry {
	name: string;
	endpoint: string;
	version?: string;
}

export interface AgentFormData {
	name: string;
	description: string;
	imageUrl: string;
	services: ServiceEntry[];
	supportedTrust: string[];
	x402Enabled: boolean;
}

export interface RegisterResult {
	agentId: number;
	hash: string;
}

export interface FeedbackParams {
	agentId: number;
	value: number | bigint;
	valueDecimals: number;
	tag1: string;
	tag2: string;
	endpoint: string;
	feedbackUri: string;
	feedbackHash: Uint8Array;
}

export interface ValidationParams {
	agentId: number;
	validatorAddress: string;
	requestUri: string;
}
