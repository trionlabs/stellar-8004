import type { RequestHandler } from './$types';
import { handleDiscovery } from '$lib/server/api/discovery.js';
import { serveApi } from '$lib/server/api/serve.js';

// Only a fallback export, as in /api/v1: OPTIONS gets the preflight answer, other non-GET a 405.
export const fallback: RequestHandler = (event) =>
	serveApi(event, (db) => handleDiscovery(db, event.url));
