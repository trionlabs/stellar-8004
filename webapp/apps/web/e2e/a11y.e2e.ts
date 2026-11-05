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
