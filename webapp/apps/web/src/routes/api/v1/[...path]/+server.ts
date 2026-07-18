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

	// SSRF/traversal guard. `params.path` is attacker-controlled and was previously interpolated
	// straight into the target string; fetch()'s URL parser then collapsed `..` (incl. the
	// double-encoded `%252e%252e` that survives CF normalization), letting a caller escape the
	// `/functions/v1/api/v1/` Edge Function prefix and reach the raw Kong gateway (/rest/v1,
	// /auth/v1). Two layers, because the upstream may itself decode once more (second-order):
	//   1. FULLY percent-decode the path (loop — beats multi-layer encoding) and reject any `..`/`.`
	//      segment or backslash. This kills `..`, `%2e%2e`, `%252e%252e`, and `..%2f` alike.
	//   2. Resolve through new URL() (same normalization fetch() applies) and assert the result is
	//      still same-origin AND under the prefix. Defense in depth.
	const PREFIX = '/functions/v1/api/v1/';
	let target: URL;
	try {
		let decoded = params.path;
		for (let i = 0; i < 3; i++) {
			const next = decodeURIComponent(decoded); // throws on malformed input → caught → 400
			if (next === decoded) break;
			decoded = next;
		}
		if (decoded.includes('\\') || decoded.split('/').some((s) => s === '..' || s === '.')) {
			throw new Error('path traversal');
		}
		const base = new URL(kongUrl);
		target = new URL(PREFIX + params.path, base);
		target.search = url.search;
		if (target.origin !== base.origin || !target.pathname.startsWith(PREFIX)) {
			throw new Error('path escapes API prefix');
		}
	} catch {
		return new Response(JSON.stringify({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid API path' } }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
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
