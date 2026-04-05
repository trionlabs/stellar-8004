import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadEvidence } from '$lib/server/ipfs';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const name = body.name as string | undefined;
	const data = body.data as string | undefined;

	if (!name || typeof data !== 'string') {
		throw error(400, 'Missing name or data (data must be a JSON string)');
	}

	try {
		// data is the pre-serialized JSON string from the client.
		// Upload the exact bytes to IPFS so the SHA-256 hash matches.
		const result = await uploadEvidence(name, data);
		return json(result);
	} catch (e) {
		console.error('IPFS upload failed:', e);
		throw error(502, 'IPFS upload failed');
	}
};
