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

	const target = `${kongUrl}/functions/v1/api/v1/${params.path}${url.search}`;
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
