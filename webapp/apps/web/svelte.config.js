import adapter from '@sveltejs/adapter-cloudflare';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, except for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		// Cloudflare Workers (Static Assets), NOT Pages. The account already runs six Workers and
		// zero Pages projects, and Cloudflare now steers new projects to Workers Static Assets — so
		// Pages would mean adopting the older platform. Routing config lives in wrangler.toml.
		adapter: adapter()
	}
};

export default config;
