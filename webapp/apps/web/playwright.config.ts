import { defineConfig } from '@playwright/test';

// The built worker on a throwaway local D1 seeded from e2e/seed.sql. Run `vite build` first.
const db = '.wrangler/e2e';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '*.e2e.ts', // not *.test.ts, which vitest owns
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? 'github' : 'list',
	use: { baseURL: 'http://127.0.0.1:8799' },
	projects: [
		{ name: 'light', use: { colorScheme: 'light' } },
		{ name: 'dark', use: { colorScheme: 'dark' } }
	],
	webServer: {
		command: [
			`rm -rf ${db}`,
			`wrangler d1 migrations apply DB --local --persist-to ${db}`,
			`wrangler d1 execute DB --local --persist-to ${db} --file e2e/seed.sql`,
			`wrangler dev --local --persist-to ${db} --ip 127.0.0.1 --port 8799`
		].join(' && '),
		url: 'http://127.0.0.1:8799/api/v1/health',
		timeout: 120_000,
		reuseExistingServer: !process.env.CI
	}
});
