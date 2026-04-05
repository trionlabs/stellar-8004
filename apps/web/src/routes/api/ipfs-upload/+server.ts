import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadEvidence } from '$lib/server/ipfs';

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB — evidence JSON should never be larger

export const POST: RequestHandler = async ({ request }) => {
	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > MAX_PAYLOAD_BYTES) {
		throw error(413, 'Payload too large');
	}

	const raw = await request.text();
	if (raw.length > MAX_PAYLOAD_BYTES) {
		throw error(413, 'Payload too large');
	}

	let body: { name?: string; data?: string };
	try {
		body = JSON.parse(raw);
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const { name, data } = body;
	if (!name || typeof data !== 'string') {
		throw error(400, 'Missing name or data (data must be a JSON string)');
	}

	try {
		const result = await uploadEvidence(name, data);
		return json(result);
	} catch (e) {
		console.error('IPFS upload failed:', e);
		throw error(502, 'IPFS upload failed');
	}
};
