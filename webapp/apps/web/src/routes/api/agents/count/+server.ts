import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/d1.js';
import type { RequestHandler } from './$types';

// Simple in-memory rate limiter: max 30 requests per IP per 60 seconds.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
	const now = Date.now();
	const entry = hits.get(ip);
	if (!entry || now > entry.resetAt) {
		hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		return false;
	}
	entry.count++;
	return entry.count > MAX_REQUESTS;
}

// Stellar public keys: uppercase G + 55 alphanumeric chars
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export const GET: RequestHandler = async ({ url, getClientAddress, platform }) => {
	if (isRateLimited(getClientAddress())) {
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
