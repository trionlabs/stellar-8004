import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadEvidence } from '$lib/server/ipfs';

export const POST: RequestHandler = async ({ request }) => {
	const { name, data } = await request.json();

	if (!name || !data) {
		throw error(400, 'Missing name or data');
	}

	try {
		const result = await uploadEvidence(name, data);
		return json(result);
	} catch (e) {
		console.error('IPFS upload failed:', e);
		throw error(502, 'IPFS upload failed');
	}
};
