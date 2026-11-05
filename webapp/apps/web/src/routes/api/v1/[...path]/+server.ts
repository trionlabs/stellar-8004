// The public API (/api/v1/*), served from D1. It replaces the Supabase edge function
// (supabase/functions/api) and the proxy that used to forward to it, and keeps both
// behaviours: the proxy's path guard, then the edge function's router.
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import type { Db } from '$lib/server/d1.js';
import { errorResponse } from '$lib/server/api/response.js';
import { serveApi } from '$lib/server/api/serve.js';
import {
	handleAccounts,
	handleAgentDetail,
	handleAgentFeedback,
	handleAgentsList,
	handleHealth,
	handleSearch,
	handleStats
} from '$lib/server/api/handlers.js';

const ALLOWED_ENDPOINTS = new Set(['agents', 'accounts', 'search', 'stats', 'health']);

/**
 * The proxy's traversal guard: fully percent-decode (beats %252e and deeper encodings),
 * reject any '%' that survives and any backslash, allow only known endpoints, and reject
 * empty and dot segments. Returns the segments re-encoded, which is how the edge function
 * saw them (so /agents/%201 stays a 400), or null for a 404.
 */
function guard(path: string): string[] | null {
	try {
		let decoded = path;
		for (let i = 0; i < 6; i++) {
			const next = decodeURIComponent(decoded);
			if (next === decoded) break;
			decoded = next;
		}
		if (decoded.includes('%') || decoded.includes('\\')) return null;
		const segments = decoded.split('/');
		if (
			!ALLOWED_ENDPOINTS.has(segments[0]) ||
			segments.some((s) => s === '' || s === '.' || s === '..')
		) {
			return null;
		}
		return segments.map((s) => encodeURIComponent(s));
	} catch {
		return null;
	}
}

function route(db: Db, parts: string[], url: URL): Promise<Response> | Response {
	const [endpoint, param, sub] = parts;
	// One network per explorer: answering ?network=testnet with mainnet rows misleads.
	const network = url.searchParams.get('network');
	if (network !== null && network !== env.PUBLIC_STELLAR_NETWORK) {
		return errorResponse(
			'INVALID_PARAM',
			`This explorer indexes ${env.PUBLIC_STELLAR_NETWORK}, not "${network}"`,
			400
		);
	}
	if (parts.length === 1) {
		if (endpoint === 'health') return handleHealth(db);
		if (endpoint === 'stats') return handleStats(db);
		if (endpoint === 'search') return handleSearch(db, url);
		if (endpoint === 'agents') return handleAgentsList(db, url);
	}
	if (endpoint === 'agents' && parts.length === 2) return handleAgentDetail(db, param);
	if (parts.length === 3) {
		if (endpoint === 'agents' && sub === 'feedback') return handleAgentFeedback(db, param, url);
		if (endpoint === 'accounts' && sub === 'agents') return handleAccounts(db, param, url);
	}
	return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
}

// Only a fallback export, so every method lands here (with a GET export SvelteKit would answer
// HEAD itself): OPTIONS gets the preflight answer and everything but GET a 405, as before.
export const fallback: RequestHandler = async (event) => {
	const parts = guard(event.params.path);
	if (!parts) return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
	return serveApi(event, (db) => route(db, parts, event.url));
};
