// The public API (/api/v1/*), served from D1. It replaces the Supabase edge function
// (supabase/functions/api) and the proxy that used to forward to it, and keeps both
// behaviours: the proxy's path guard, then the edge function's router.
import type { RequestHandler } from './$types';
import { getDb, type Db } from '$lib/server/d1.js';
import { withinRateLimit } from '$lib/server/rate-limit.js';
import { errorResponse } from '$lib/server/api/response.js';
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

const PREFLIGHT_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Max-Age': '86400'
};

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
export const fallback: RequestHandler = async ({
	params,
	url,
	request,
	platform,
	getClientAddress
}) => {
	const parts = guard(params.path);
	if (!parts) return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: PREFLIGHT_HEADERS });
	}
	if (request.method !== 'GET') {
		return errorResponse('METHOD_NOT_ALLOWED', 'Only GET requests are supported', 405);
	}

	let response: Response;
	if (await withinRateLimit(platform, getClientAddress)) {
		try {
			response = await route(getDb(platform), parts, url);
		} catch (err) {
			console.error('API error:', err);
			response = errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
		}
	} else {
		response = errorResponse('RATE_LIMITED', 'Too many requests. Try again later.', 429);
		response.headers.set('X-RateLimit-Remaining', '0');
	}
	// No Retry-After, and a Reset that is not a number: the SDK sleeps on either before it
	// retries, which would leave MCP tool calls hanging for minutes.
	response.headers.set('X-RateLimit-Limit', '30');
	response.headers.set('X-RateLimit-Reset', new Date(Date.now() + 60_000).toISOString());
	return response;
};
