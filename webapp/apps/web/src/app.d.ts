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
			};
		}
	}
}

export {};
