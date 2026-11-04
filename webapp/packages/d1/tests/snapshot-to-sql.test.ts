import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { snapshotToSql } from '../scripts/snapshot-to-sql.js';
import { createTestD1 } from '../src/test-db.js';

const BIG = '1' + '0'.repeat(38);

// Rows shaped like PostgREST output, as snapshot-supabase.py saves them.
function writeSnapshot(tables: Record<string, unknown[]>, lock = true): string {
	const dir = mkdtempSync(join(tmpdir(), 'snapshot-'));
	const all = {
		agent_metadata: [],
		feedback_responses: [],
		validations: [],
		indexer_dead_letter: [],
		...tables
	};
	for (const [table, rows] of Object.entries(all)) writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows));
	writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ taken_at: '2026-11-03T23:19:47Z', under_indexer_lock: lock }));
	return dir;
}

const agentRow = (id: number, extra: Record<string, unknown> = {}) => ({
	id,
	owner: 'GOWNER',
	agent_uri: null,
	agent_uri_data: { name: 'lossy' },
	agent_uri_data_text: '{"name": "O\'Brien Agent", "n": 12345678901234567890}',
	wallet: null,
	created_at: '2026-04-12T13:10:59+00:00',
	updated_at: '2026-04-12T13:10:59.123456+00:00',
	created_ledger: 63000000,
	tx_hash: 'abc',
	uri_resolve_attempts: 0,
	resolve_uri_pending: false,
	last_resolve_attempt_at: null,
	supported_trust: ['reputation'],
	services: [],
	services_text: '[{"name": "mcp", "endpoint": "https://x"}]',
	x402_enabled: true,
	mpp_enabled: false,
	uri_updated_ledger: null,
	transferred_ledger: null,
	registry_address: 'ignored',
	network: 'mainnet',
	search_vector: "'agent':2",
	...extra
});

const feedbackRow = (id: number, client: string, valueText: string, value: number) => ({
	id,
	agent_id: 1,
	client_address: client,
	feedback_index: id,
	value,
	value_text: valueText,
	value_decimals: 0,
	tag1: null,
	tag2: null,
	endpoint: null,
	feedback_uri: null,
	feedback_hash: null,
	is_revoked: false,
	created_at: '2026-04-12T13:13:17+00:00',
	created_ledger: 63000001,
	tx_hash: 'def',
	revoked_ledger: null,
	registry_address: 'ignored'
});

const state = (id: string) => ({
	id,
	last_ledger: 65292380,
	updated_at: '2026-11-03T23:19:04.947+00:00',
	expected_next_ledger: 65292381,
	defer_attempts: 0,
	last_advanced_at: '2026-11-03T23:19:04.947+00:00'
});

describe('snapshotToSql', () => {
	it('loads a snapshot exactly, keeping exact text copies and the copy fence', async () => {
		const dir = writeSnapshot({
			agents: [agentRow(1)],
			feedback: [feedbackRow(1, 'GA', '90', 90), feedbackRow(2, 'GB', BIG, 1e38)],
			indexer_state: ['identity', 'reputation', 'validation'].map(state)
		});
		const db = createTestD1();
		await db.exec(snapshotToSql(dir));

		const agent = await db.prepare('SELECT * FROM agents').first<Record<string, unknown>>();
		expect(agent).toMatchObject({
			agent_uri_data: '{"name": "O\'Brien Agent", "n": 12345678901234567890}',
			services: '[{"name": "mcp", "endpoint": "https://x"}]',
			supported_trust: '["reputation"]',
			x402_enabled: 1,
			resolve_uri_pending: 0,
			updated_at: '2026-04-12T13:10:59.123456+00:00'
		});
		expect(await db.prepare('SELECT value FROM feedback WHERE id = 2').first('value')).toBe(BIG);
		expect(await db.prepare('SELECT count(*) AS n FROM indexer_state').first('n')).toBe(3);
		expect(await db.prepare('SELECT owner FROM indexer_locks').first('owner')).toBe('copy-fence');
		// Search and the leaderboard work on the loaded rows.
		expect(await db.prepare("SELECT rowid FROM agents_fts WHERE agents_fts MATCH '\"brien\"'").first('rowid')).toBe(1);
		expect(await db.prepare('SELECT feedback_count FROM leaderboard_scores').first('feedback_count')).toBe(2);
	});

	it('replaces what a previous load wrote', async () => {
		const db = createTestD1();
		await db.exec(snapshotToSql(writeSnapshot({ agents: [agentRow(1), agentRow(2)], feedback: [], indexer_state: [] })));
		await db.exec(snapshotToSql(writeSnapshot({ agents: [agentRow(1)], feedback: [], indexer_state: [] })));
		expect(await db.prepare('SELECT count(*) AS n FROM agents').first('n')).toBe(1);
	});

	it('keeps every statement under D1\'s 100 KB limit and still loads large values exactly', async () => {
		const description = "Çok büyük 'agent' açıklaması ✓ ".repeat(8_000); // ~250 KB, multi-byte, quotes
		const uriData = JSON.stringify({ name: 'Big Agent', description });
		const services = JSON.stringify(Array.from({ length: 1_500 }, (_, i) => ({ name: `s${i}`, endpoint: `https://x/${'p'.repeat(60)}/${i}` })));
		const dataUri = 'data:application/json,' + encodeURIComponent(uriData).slice(0, 120_000);
		const sql = snapshotToSql(
			writeSnapshot({
				agents: [agentRow(1, { agent_uri: dataUri, agent_uri_data_text: uriData, services_text: services })],
				feedback: [],
				indexer_state: []
			})
		);
		const longest = Math.max(...sql.split('\n').map((line) => Buffer.byteLength(line)));
		expect(longest).toBeLessThanOrEqual(100_000);

		const db = createTestD1(); // enforces the statement limit too
		await db.exec(sql);
		const row = await db.prepare('SELECT agent_uri, agent_uri_data, services FROM agents WHERE id = 1').first<Record<string, string>>();
		expect(row).toEqual({ agent_uri: dataUri, agent_uri_data: uriData, services });
		expect(await db.prepare("SELECT rowid FROM agents_fts WHERE agents_fts MATCH '\"big\"'").first('rowid')).toBe(1);
		expect(await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'load_pieces'").first('n')).toBe(0);
	});

	it('refuses to load after the cutover removed the copy fence', async () => {
		const db = createTestD1();
		const sql = snapshotToSql(writeSnapshot({ agents: [agentRow(1)], feedback: [], indexer_state: [] }));
		await db.exec(sql);
		await db.prepare("DELETE FROM indexer_locks WHERE owner = 'copy-fence'").run();
		await db.prepare('INSERT INTO agents (id, owner) VALUES (2, ?)').bind('GNEW').run();

		await expect(db.exec(sql)).rejects.toThrow(/CHECK constraint failed/);
		expect(await db.prepare('SELECT count(*) AS n FROM agents').first('n')).toBe(2);
	});

	it('refuses snapshots that would lose data or consistency', () => {
		expect(() => snapshotToSql(writeSnapshot({ agents: [], feedback: [], indexer_state: [] }, false))).toThrow(
			/indexer lock/
		);
		const noText = { ...feedbackRow(1, 'GA', '1', 1), value_text: undefined };
		expect(() => snapshotToSql(writeSnapshot({ agents: [agentRow(1)], feedback: [noText], indexer_state: [] }))).toThrow(
			/value_text missing/
		);
		const unsafe = agentRow(1, { created_ledger: 2 ** 60 });
		expect(() => snapshotToSql(writeSnapshot({ agents: [unsafe], feedback: [], indexer_state: [] }))).toThrow(
			/not a safe integer/
		);
	});
});
