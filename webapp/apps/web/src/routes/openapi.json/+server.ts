import { json } from '@sveltejs/kit';
import spec from '$lib/server/api/openapi.json';

// The spec is edited by hand; the v1 and v2 test suites check it against the routes.
export const GET = () =>
	json(spec, {
		headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' }
	});
