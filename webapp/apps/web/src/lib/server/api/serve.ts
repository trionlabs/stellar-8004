import type { RequestEvent } from '@sveltejs/kit';
import { getDb, type Db } from '$lib/server/d1.js';
import { withinRateLimit } from '$lib/server/rate-limit.js';
import { errorResponse } from './response.js';

const PREFLIGHT_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Max-Age': '86400'
};

/**
 * What every public API route shares: the CORS preflight, GET only, the per-client rate
 * limit and its headers, and a generic 500 for anything a handler throws.
 */
export async function serveApi(
	{
		request,
		platform,
		getClientAddress
	}: Pick<RequestEvent, 'request' | 'platform' | 'getClientAddress'>,
	handle: (db: Db) => Promise<Response> | Response
): Promise<Response> {
	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: PREFLIGHT_HEADERS });
	}
	if (request.method !== 'GET') {
		return errorResponse('METHOD_NOT_ALLOWED', 'Only GET requests are supported', 405);
	}

	let response: Response;
	if (await withinRateLimit(platform, getClientAddress)) {
		try {
			response = await handle(getDb(platform));
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
}
