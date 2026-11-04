import { beforeAll, describe, expect, it } from 'vitest';
import { createTestD1, type TestD1 } from '@stellar8004/d1/test-db';
import { ftsMatch } from './search.js';

let db: TestD1;
const search = async (q: string) => {
	const match = ftsMatch(q);
	if (match === null) return [];
	const { results } = await db
		.prepare('SELECT rowid FROM agents_fts WHERE agents_fts MATCH ? ORDER BY rowid')
		.bind(match)
		.all<{ rowid: number }>();
	return results.map((r) => r.rowid);
};

beforeAll(async () => {
	db = createTestD1();
	const agents = [
		{ name: 'Stellar Logo Agent', description: 'Designs logos and wordmarks' },
		{ name: 'Price Feed', description: 'Real-time market data for Stellar assets' },
		{ name: 'Café Bot', description: null },
		{ name: 'İstanbul Guide', description: 'City tips' }
	];
	for (const [i, data] of agents.entries()) {
		await db.prepare('INSERT INTO agents (id, owner, agent_uri_data) VALUES (?, ?, ?)').bind(i, 'G', JSON.stringify(data)).run();
	}
});

describe('ftsMatch', () => {
	it('matches every word, stemmed, in name or description', async () => {
		expect(await search('logo')).toEqual([0]);
		expect(await search('Logos')).toEqual([0]);
		expect(await search('stellar')).toEqual([0, 1]);
		expect(await search('stellar market')).toEqual([1]);
	});

	it('ignores stopwords, and a stopword-only query matches nothing', async () => {
		expect(await search('the logo')).toEqual([0]);
		expect(ftsMatch('the and of')).toBeNull();
		expect(ftsMatch('   ')).toBeNull();
	});

	it('never reads user input as FTS5 syntax', async () => {
		for (const q of ['logo*', '"logo', 'logo OR price', 'NEAR(logo price)', 'name:logo', '-logo', '(((']) {
			await expect(search(q)).resolves.toBeDefined();
		}
		expect(await search('logo OR price')).toEqual([]); // "or" is a stopword; logo AND price
	});

	it('keeps non-ASCII letters, in either Unicode form', async () => {
		expect(await search('café')).toEqual([2]);
		expect(await search('café')).toEqual([2]); // decomposed é
		expect(await search('İstanbul')).toEqual([3]);
	});

	it('leaves case folding to the tokenizer', async () => {
		expect(await search('LOGO')).toEqual([0]);
		expect(await search('The LOGOS')).toEqual([0]);
	});
});
