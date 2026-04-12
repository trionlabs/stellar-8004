import { json } from '@sveltejs/kit';
import { createAnonSupabase } from '$lib/supabase-server.js';
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

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (isRateLimited(getClientAddress())) {
		return json({ error: 'Too many requests' }, { status: 429 });
	}

	const owner = url.searchParams.get('owner');
	if (!owner || !STELLAR_ADDRESS_RE.test(owner)) {
		return json({ count: null }, { status: 400 });
	}

	const db = createAnonSupabase();
	const { count, error } = await db
		.from('agents')
		.select('id', { count: 'exact', head: true })
		.eq('owner', owner);

	if (error) {
		return json({ count: null }, { status: 500 });
	}

	return json({ count }, {
		headers: {
			'Cache-Control': 'private, max-age=15'
		}
	});
};
