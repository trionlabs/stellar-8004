import type { Db } from '@stellar8004/d1';

export type { Db };

/** The D1 database bound to this Worker as DB (see wrangler.toml). */
export function getDb(platform: App.Platform | undefined): Db {
	const db = platform?.env?.DB;
	if (!db) throw new Error('D1 binding DB is missing');
	return db;
}

const JSON_COLUMNS = new Set(['agent_uri_data', 'services', 'supported_trust']);
const BOOLEAN_COLUMNS = new Set([
	'x402_enabled',
	'mpp_enabled',
	'resolve_uri_pending',
	'is_revoked',
	'has_response',
	'has_services'
]);

/**
 * Gives a D1 row the shape PostgREST used to return: JSON columns parsed, 0/1 flags as
 * booleans. Every other column passes through unchanged. feedback.value stays a string
 * (it can exceed what a double holds); callers convert it where they used to get a number.
 */
export function decodeRow<T>(row: Record<string, unknown>): T {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		if (JSON_COLUMNS.has(key) && typeof value === 'string') out[key] = JSON.parse(value);
		else if (BOOLEAN_COLUMNS.has(key) && typeof value === 'number') out[key] = value === 1;
		else out[key] = value;
	}
	return out as T;
}
