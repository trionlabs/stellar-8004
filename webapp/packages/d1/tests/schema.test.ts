import { beforeEach, describe, expect, it } from 'vitest';
import { createTestD1, type TestD1 } from '../src/test-db.js';

const OWNER = 'GOWNER';
let db: TestD1;

async function agent(id: number, uriData: object | null = { name: `Agent ${id}` }, owner = OWNER) {
	await db
		.prepare('INSERT INTO agents (id, owner, agent_uri_data) VALUES (?, ?, ?)')
		.bind(id, owner, uriData && JSON.stringify(uriData))
		.run();
}

let nextIndex = 1;
async function feedback(agentId: number, client: string, value: string, decimals = 0, revoked = false) {
	await db
		.prepare(
			'INSERT INTO feedback (agent_id, client_address, feedback_index, value, value_decimals, is_revoked) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.bind(agentId, client, nextIndex++, value, decimals, revoked)
		.run();
}

const score = (agentId: number) =>
	db.prepare('SELECT * FROM leaderboard_scores WHERE agent_id = ?').bind(agentId).first<Record<string, number>>();

beforeEach(() => {
	db = createTestD1();
	nextIndex = 1;
});

describe('leaderboard_scores', () => {
	it('averages feedback like the live view', async () => {
		await agent(1);
		await feedback(1, 'GA', '90');
		expect(await score(1)).toMatchObject({
			total_score: 90,
			avg_score: 90,
			feedback_count: 1,
			unique_clients: 1,
			score_exact: 1
		});
	});

	it('rounds half away from zero at 2 decimals, where REAL arithmetic would not', async () => {
		await agent(1);
		await feedback(1, 'GA', '267', 2);
		await feedback(1, 'GB', '268', 2); // mean 2.675
		await agent(2);
		await feedback(2, 'GA', '-267', 2);
		await feedback(2, 'GB', '-268', 2); // mean -2.675
		expect((await score(1))?.total_score).toBe(2.68);
		expect((await score(2))?.total_score).toBe(-2.68);
	});

	it('mixes decimal scales exactly', async () => {
		await agent(1);
		await feedback(1, 'GA', '5'); // 5
		await feedback(1, 'GB', '5', 1); // 0.5
		expect((await score(1))?.total_score).toBe(2.75);
	});

	it("excludes revoked feedback and the current owner's own feedback", async () => {
		await agent(1);
		await feedback(1, 'GA', '80');
		await feedback(1, 'GA', '10', 0, true);
		await feedback(1, OWNER, '100');
		expect(await score(1)).toMatchObject({ total_score: 80, feedback_count: 1, unique_clients: 1 });

		// After a transfer to GA, GA's feedback is self-feedback and stops counting.
		await db.prepare('UPDATE agents SET owner = ? WHERE id = ?').bind('GA', 1).run();
		expect(await score(1)).toMatchObject({ total_score: 100, feedback_count: 1 });
	});

	it('scores agents without feedback as 0', async () => {
		await agent(1);
		expect(await score(1)).toMatchObject({ total_score: 0, feedback_count: 0, unique_clients: 0, score_exact: 1 });
	});

	it('keeps working for the largest value the contract allows', async () => {
		await agent(1);
		await feedback(1, 'GA', '1' + '0'.repeat(38));
		const row = await score(1);
		expect(row?.score_exact).toBe(0);
		expect(row?.total_score).toBe(1e38);
	});
});

describe('agents_fts', () => {
	it('finds agents by stemmed words in name and description, and follows updates', async () => {
		await agent(1, { name: 'Stellar Logo Agent', description: 'Designs logos for projects' });
		await agent(2, { name: 'Price Feed' });
		const hits = async (q: string) =>
			(await db.prepare('SELECT rowid FROM agents_fts WHERE agents_fts MATCH ?').bind(q).all<{ rowid: number }>())
				.results.map((r) => r.rowid);

		expect(await hits('"logo"')).toEqual([1]);
		await db.prepare('UPDATE agents SET agent_uri_data = ? WHERE id = 1').bind(JSON.stringify({ name: 'Renamed' })).run();
		expect(await hits('"logo"')).toEqual([]);
		expect(await hits('"renamed"')).toEqual([1]);
	});
});

describe('constraints and triggers', () => {
	it('clears metadata when an agent is transferred', async () => {
		await agent(1);
		await db.prepare('INSERT INTO agent_metadata (agent_id, key, value) VALUES (1, ?, ?)').bind('k', 'v').run();
		await db.prepare('UPDATE agents SET owner = ?, transferred_ledger = ? WHERE id = 1').bind('GNEW', 10).run();
		expect(await db.prepare('SELECT count(*) AS n FROM agent_metadata').first('n')).toBe(0);
	});

	it('stores feedback values only as exact integers', async () => {
		await agent(1);
		await expect(feedback(1, 'GA', '-12')).resolves.toBeUndefined();
		for (const bad of ['1.5', '--5', '5a', '', '-']) {
			await expect(feedback(1, 'GB', bad)).rejects.toThrow(/CHECK constraint failed/);
		}
	});

	it('rejects feedback for an agent that is not indexed yet', async () => {
		await expect(feedback(99, 'GA', '1')).rejects.toThrow(/FOREIGN KEY constraint failed/);
	});

	it('starts with the copy fence that keeps the indexer from running', async () => {
		expect(await db.prepare("SELECT owner FROM indexer_locks WHERE lock_name = 'indexer'").first('owner')).toBe(
			'copy-fence'
		);
	});
});

describe('test database', () => {
	it('enforces D1 binding rules', () => {
		const statement = db.prepare('SELECT 1');
		expect(() => statement.bind(...Array.from({ length: 101 }, () => 1))).toThrow(/too many SQL variables/);
		expect(() => statement.bind(undefined)).toThrow(/D1_TYPE_ERROR/);
	});

	it('rolls back a failed batch as a whole', async () => {
		await expect(
			db.batch([
				db.prepare('INSERT INTO agents (id, owner) VALUES (1, ?)').bind(OWNER),
				db.prepare('INSERT INTO agents (id, owner) VALUES (1, ?)').bind(OWNER)
			])
		).rejects.toThrow(/UNIQUE constraint failed/);
		expect(await db.prepare('SELECT count(*) AS n FROM agents').first('n')).toBe(0);
	});
});
