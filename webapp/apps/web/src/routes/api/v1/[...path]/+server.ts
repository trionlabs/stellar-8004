import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const FORWARDED_HEADERS = [
	'content-type',
	'cache-control',
	'access-control-allow-origin',
	'access-control-allow-methods',
	'access-control-allow-headers',
	'x-ratelimit-limit',
	'x-ratelimit-remaining',
	'x-ratelimit-reset',
];

const handler: RequestHandler = async ({ params, url, request, getClientAddress }) => {
	const kongUrl = env.SUPABASE_URL;
	if (!kongUrl) {
		return new Response(JSON.stringify({ success: false, error: { code: 'CONFIG_ERROR', message: 'API backend not configured' } }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// `params.path` is a catch-all interpolated into the upstream URL. Constrain
	// it to the known api endpoints (positive allowlist) so a crafted path such
	// as `../../indexer` can't traverse out of the `api` function and reach
	// another edge function on the same gateway.
	const notFound = () =>
		new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});

	const ALLOWED_ENDPOINTS = new Set(['agents', 'accounts', 'search', 'stats', 'health']);
	// Validate the DECODED segments, not the raw ones. A literal '..'/''/'.'
	// check on the raw path is insufficient: the WHATWG URL parser in fetch()
	// percent-decodes each segment once, so `agents/%2e%2e/%2e%2e/indexer` passes
	// a raw '..' check yet collapses to `.../api/indexer`, escaping the api/v1
	// namespace to reach another edge function. Decode once (matching that single
	// decode), reject any dot-segment or embedded separator, then rebuild the
	// path from re-encoded segments so the URL handed to fetch() is already
	// normalized and no traversal can survive parsing.
	let segments: string[];
	try {
		segments = (params.path ?? '').split('/').map((s) => decodeURIComponent(s));
	} catch {
		return notFound(); // malformed percent-encoding
	}
	if (
		!ALLOWED_ENDPOINTS.has(segments[0]) ||
		segments.some((s) => s === '' || s === '.' || s === '..' || s.includes('/') || s.includes('\\'))
	) {
		return notFound();
	}

	const safePath = segments.map((s) => encodeURIComponent(s)).join('/');
	const target = `${kongUrl}/functions/v1/api/v1/${safePath}${url.search}`;
	const anonKey = env.SUPABASE_ANON_KEY;

	let resp: Response;
	try {
		resp = await fetch(target, {
			method: request.method,
			headers: {
				'x-real-ip': getClientAddress(),
				...(anonKey ? { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` } : {}),
			},
			body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
		});
	} catch {
		return new Response(JSON.stringify({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'API backend unavailable' } }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const headers = new Headers();
	for (const key of FORWARDED_HEADERS) {
		const val = resp.headers.get(key);
		if (val) headers.set(key, val);
	}

	return new Response(resp.body, {
		status: resp.status,
		headers,
	});
};

export const GET = handler;
export const OPTIONS = handler;
