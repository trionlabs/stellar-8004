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

	// SSRF/traversal guard combining both hardening passes:
	//   - positive endpoint allowlist (origin/main 5ecfc5b): only known api endpoints, so a crafted
	//     path can't hop out of the `api` function to another edge function (/indexer, /rest/v1, /auth/v1).
	//   - full multi-pass percent-decode + new URL() origin/prefix assertion (feat 2093be8): kills
	//     `..`, `%2e%2e`, `%252e%252e`, `..%2f` incl. second-order decodes, then re-encodes each
	//     segment and asserts the resolved URL stays same-origin and under the api/v1 prefix.
	const PREFIX = '/functions/v1/api/v1/';
	const ALLOWED_ENDPOINTS = new Set(['agents', 'accounts', 'search', 'stats', 'health']);
	const notFound = () =>
		new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});

	let target: URL;
	try {
		// 1. Fully percent-decode (loop beats %252e / deeper second-order encodings).
		let decoded = params.path ?? '';
		for (let i = 0; i < 6; i++) {
			const next = decodeURIComponent(decoded);
			if (next === decoded) break;
			decoded = next;
		}
		// Any surviving '%' means the input was encoded deeper than the loop unwound;
		// reject it (and any backslash) outright — allowlisted endpoints/ids never
		// contain either, so this closes the multi-layer-encoding gap with no loop race.
		if (decoded.includes('%') || decoded.includes('\\')) throw new Error('traversal');
		const segments = decoded.split('/');
		// 2. Positive allowlist + dot-segment/empty rejection.
		if (
			!ALLOWED_ENDPOINTS.has(segments[0]) ||
			segments.some((s) => s === '' || s === '.' || s === '..')
		) {
			return notFound();
		}
		// 3. Rebuild from re-encoded segments so fetch()'s own decode can't reintroduce traversal.
		const safePath = segments.map((s) => encodeURIComponent(s)).join('/');
		const base = new URL(kongUrl);
		target = new URL(PREFIX + safePath, base);
		target.search = url.search;
		// 4. Defense in depth: assert same-origin AND under prefix.
		if (target.origin !== base.origin || !target.pathname.startsWith(PREFIX)) return notFound();
	} catch {
		return notFound();
	}
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
