// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Db } from '@stellar8004/d1';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				DB: Db;
				// Workers rate limiting binding ([[ratelimits]] in wrangler.toml).
				API_RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
				// [version_metadata] in wrangler.toml.
				CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
			};
		}
	}
}

export {};
