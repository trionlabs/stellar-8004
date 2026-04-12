import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const handler: RequestHandler = async ({ params, url, request, getClientAddress }) => {
	const kongUrl = env.SUPABASE_URL;
	if (!kongUrl) {
		return new Response(JSON.stringify({ success: false, error: { code: 'CONFIG_ERROR', message: 'API backend not configured' } }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const target = `${kongUrl}/functions/v1/api/v1/${params.path}${url.search}`;

	const resp = await fetch(target, {
		method: request.method,
		headers: {
			'x-real-ip': getClientAddress(),
		},
	});

	const headers = new Headers();
	for (const key of ['content-type', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
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
