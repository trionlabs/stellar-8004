import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// The SvelteKit plugin isn't loaded here, so map $lib for tests that import server modules.
	resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
	test: { include: ['src/**/*.test.ts'] }
});
