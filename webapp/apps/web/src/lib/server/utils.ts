import { error } from '@sveltejs/kit';
import type { Database } from '@stellar8004/db';

export type AgentUriData = Database['public']['Tables']['agents']['Row']['agent_uri_data'];

export function readUriField(source: AgentUriData, field: string): string | null {
	if (!source || Array.isArray(source) || typeof source !== 'object') {
		return null;
	}

	const value = source[field];

	return typeof value === 'string' && value.length > 0 ? value : null;
}

export function assertSuccess<T>(
	result: { data: T; error: { message: string } | null },
	label: string
): T {
	if (result.error) {
		throw error(500, `${label} query failed: ${result.error.message}`);
	}

	return result.data;
}

export function toDisplayScore(value: string | number | null, decimals: number): number {
	return Number(value ?? 0) / Math.pow(10, decimals);
}
