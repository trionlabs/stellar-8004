/** An agents row after decodeRow. */
export type AgentRow = {
	id: number;
	owner: string;
	agent_uri: string | null;
	agent_uri_data: unknown;
	wallet: string | null;
	created_at: string;
	updated_at: string;
	uri_resolve_attempts: number;
	resolve_uri_pending: boolean;
	supported_trust: string[];
	services: unknown[];
	x402_enabled: boolean;
	mpp_enabled: boolean;
};

/** A leaderboard_scores row after decodeRow (score_exact left out: no page reads it). */
export type ScoreRow = {
	agent_id: number;
	agent_name: string | null;
	agent_image: string | null;
	owner: string;
	supported_trust: string[];
	has_services: boolean;
	feedback_count: number;
	avg_score: number;
	unique_clients: number;
	total_score: number;
};

export function readUriField(source: unknown, field: string): string | null {
	if (!source || Array.isArray(source) || typeof source !== 'object') {
		return null;
	}

	const value = (source as Record<string, unknown>)[field];

	return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toDisplayScore(value: string | number | null, decimals: number): number {
	return Number(value ?? 0) / Math.pow(10, decimals);
}
