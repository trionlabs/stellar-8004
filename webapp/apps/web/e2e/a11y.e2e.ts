import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/agents', '/agents/0', '/leaderboard', '/register', '/developers'];

for (const path of PAGES) {
	test(`${path} renders and has no serious WCAG 2 AA violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator('h1').first()).toBeVisible();

		const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
		const serious = violations
			.filter((v) => v.impact === 'serious' || v.impact === 'critical')
			.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(' ')}`);
		expect(serious).toEqual([]);
	});
}

test('code blocks keep light colours in light mode when the dark theme loads last', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'light');
	// Each Shiki theme is its own chunk; hold back the dark one (#0d1117 background).
	await page.route('**/_app/immutable/chunks/*.js', async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		if (body.includes('"activityBar.background":"#0d1117"')) {
			await new Promise((resolve) => setTimeout(resolve, 1500));
		}
		await route.fulfill({ response, body });
	});
	await page.goto('/developers');
	await page.waitForTimeout(3000);
	const { violations } = await new AxeBuilder({ page })
		.include('.shiki')
		.withTags(['wcag2aa'])
		.analyze();
	expect(violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
});
