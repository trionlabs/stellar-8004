import type { Handle } from '@sveltejs/kit';
import { AGENT_SKILL_MD } from '$lib/server/agent-skill.js';

// Sent with every response. The Content-Security-Policy itself comes from kit.csp in
// svelte.config.js, so SvelteKit can attach nonces to its own scripts.
export const SECURITY_HEADERS: Record<string, string> = {
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};

export const handle: Handle = async ({ event, resolve }) => {
	const response =
		event.url.pathname === '/skill.md'
			? new Response(AGENT_SKILL_MD, {
					headers: {
						'Content-Type': 'text/markdown; charset=utf-8',
						'Cache-Control': 'public, max-age=300'
					}
				})
			: await resolve(event);
	// The deployed Worker version; uploads are tagged with their git commit (versions upload --tag).
	const build = event.platform?.env.CF_VERSION_METADATA;
	if (build) response.headers.set('X-Build', build.tag || build.id);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	return response;
};
