import { createTestD1, type TestD1 } from '@stellar8004/d1/test-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCK_STALE_MS, acquireLock, constraintFailure, pgTime, releaseLock } from './db.js';
import { rows } from './test-helpers.js';

let db: TestD1;
beforeEach(() => {
	db = createTestD1();
});

const lockRow = async () => (await rows(db, 'SELECT acquired_at, owner FROM indexer_locks'))[0];

describe('indexer lock', () => {
	it('stays with the copy fence until cutover deletes it', async () => {
		const later = new Date('2030-01-01T00:00:00Z');
		expect(await acquireLock(db, 'run-a', later)).toBe(false);
		expect(await lockRow()).toMatchObject({ owner: 'copy-fence' });

		await db.prepare("DELETE FROM indexer_locks WHERE owner = 'copy-fence'").run();
		expect(await acquireLock(db, 'run-a', later)).toBe(true);
	});

	it('is exclusive until the holder goes stale, and only the holder releases it', async () => {
		await db.prepare('DELETE FROM indexer_locks').run();
		const start = new Date('2026-11-04T00:00:00Z');
		expect(await acquireLock(db, 'run-a', start)).toBe(true);
		expect(await acquireLock(db, 'run-b', new Date(start.getTime() + LOCK_STALE_MS - 1_000))).toBe(
			false
		);
		expect(await lockRow()).toEqual({
			acquired_at: '2026-11-04T00:00:00.000+00:00',
			owner: 'run-a'
		});

		expect(await acquireLock(db, 'run-b', new Date(start.getTime() + LOCK_STALE_MS + 1_000))).toBe(
			true
		);
		await releaseLock(db, 'run-a');
		expect(await lockRow()).toMatchObject({ owner: 'run-b' });
		await releaseLock(db, 'run-b');
		expect(await lockRow()).toBeUndefined();
	});
});

describe('pgTime', () => {
	it('writes the PostgREST layout, keeping RPC precision', () => {
		expect(pgTime('2026-04-03T12:00:00Z')).toBe('2026-04-03T12:00:00+00:00');
		expect(pgTime(new Date('2026-04-03T12:00:00.250Z'))).toBe('2026-04-03T12:00:00.250+00:00');
		expect(pgTime('2026-04-03T14:00:00+02:00')).toBe('2026-04-03T12:00:00.000+00:00');
		expect(() => pgTime('yesterday')).toThrow(/Invalid timestamp/);
	});
});

describe('constraintFailure', () => {
	it('tells a missing parent from other constraint failures and from infrastructure errors', async () => {
		const failure = (sql: string) =>
			db
				.prepare(sql)
				.run()
				.then(
					() => null,
					(error: unknown) => constraintFailure(error)
				);
		expect(await failure("INSERT INTO agent_metadata (agent_id, key) VALUES (1, 'k')")).toBe(
			'parent'
		);
		expect(await failure("INSERT INTO agents (id, owner) VALUES (-1, 'G')")).toBe('constraint');
		expect(await failure('INSERT INTO agents (id) VALUES (1)')).toBe('constraint');
		// D1's wording of the same failures.
		expect(
			constraintFailure(new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT'))
		).toBe('parent');
		expect(
			constraintFailure(
				new Error('D1_ERROR: UNIQUE constraint failed: agents.id: SQLITE_CONSTRAINT')
			)
		).toBe('constraint');
		expect(constraintFailure(new Error('D1_ERROR: Network connection lost.'))).toBeNull();
		expect(
			constraintFailure(new Error('D1 DB is overloaded. Too many requests queued.'))
		).toBeNull();
	});
});
