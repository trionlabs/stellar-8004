export interface ServiceEntry {
	name: string;
	endpoint: string;
	version?: string;
	description?: string;
	inputExample?: string;
}

export interface AgentFormData {
	name: string;
	description: string;
	imageUrl: string;
	services: ServiceEntry[];
	supportedTrust: string[];
	x402Enabled: boolean;
}
