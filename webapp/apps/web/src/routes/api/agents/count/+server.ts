import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/d1.js';
import { withinRateLimit } from '$lib/server/rate-limit.js';
import type { RequestHandler } from './$types';

// Stellar public keys: uppercase G + 55 alphanumeric chars
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export const GET: RequestHandler = async ({ url, getClientAddress, platform }) => {
	// Its own budget (30 per minute per client), separate from /api/v1.
	if (!(await withinRateLimit(platform, () => `count:${getClientAddress()}`))) {
		return json({ error: 'Too many requests' }, { status: 429 });
	}

	const owner = url.searchParams.get('owner');
	if (!owner || !STELLAR_ADDRESS_RE.test(owner)) {
		return json({ count: null }, { status: 400 });
	}

	let count: number | null;
	try {
		count = await getDb(platform)
			.prepare('SELECT COUNT(*) AS n FROM agents WHERE owner = ?')
			.bind(owner)
			.first<number>('n');
	} catch (error) {
		console.error('[Agent count] query failed:', error);
		return json({ count: null }, { status: 500 });
	}

	return json(
		{ count },
		{
			headers: {
				'Cache-Control': 'private, max-age=15'
			}
		}
	);
};
