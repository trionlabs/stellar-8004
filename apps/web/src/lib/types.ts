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

export type UriMode = 'auto' | 'manual';
