import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);
// D1 rejects statements with more bound parameters than this.
const MAX_BOUND_PARAMETERS = 100;

type Row = Record<string, unknown>;

export interface TestD1Result<T = Row> {
	success: true;
	results: T[];
	meta: { changes: number; last_row_id: number };
}

function toSqlValue(value: unknown): SQLInputValue {
	if (value === undefined) throw new TypeError('D1_TYPE_ERROR: Type "undefined" is not supported');
	if (typeof value === 'boolean') return value ? 1 : 0;
	if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') {
		return value;
	}
	if (value instanceof Uint8Array) return value;
	throw new TypeError(`D1_TYPE_ERROR: Type "${typeof value}" is not supported`);
}

export class TestD1Statement {
	constructor(
		private readonly db: DatabaseSync,
		private readonly sql: string,
		private readonly params: SQLInputValue[] = []
	) {}

	bind(...values: unknown[]): TestD1Statement {
		if (values.length > MAX_BOUND_PARAMETERS) {
			throw new Error(`D1_ERROR: too many SQL variables (${values.length} > ${MAX_BOUND_PARAMETERS})`);
		}
		return new TestD1Statement(this.db, this.sql, values.map(toSqlValue));
	}

	execute<T = Row>(): TestD1Result<T> {
		const results = this.db.prepare(this.sql).all(...this.params) as T[];
		const meta = this.db.prepare('SELECT changes() AS changes, last_insert_rowid() AS id').get() as Row;
		return { success: true, results, meta: { changes: Number(meta.changes), last_row_id: Number(meta.id) } };
	}

	async all<T = Row>(): Promise<TestD1Result<T>> {
		return this.execute<T>();
	}

	async run<T = Row>(): Promise<TestD1Result<T>> {
		return this.execute<T>();
	}

	async first<T = unknown>(column?: string): Promise<T | null> {
		const [row] = this.execute<Row>().results;
		if (!row) return null;
		return (column === undefined ? row : row[column]) as T;
	}

	async raw<T = unknown[]>(): Promise<T[]> {
		return this.execute<Row>().results.map((row) => Object.values(row)) as T[];
	}
}

/**
 * In-memory stand-in for a D1 database in unit tests, built on node:sqlite with every
 * migration in ../migrations applied. It copies the parts of the D1 binding the Workers
 * use, and D1's rules for them: at most 100 bound parameters, no undefined bindings,
 * booleans stored as 0/1, foreign keys on, and batch() as one transaction.
 */
export function createTestD1() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
		sqlite.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
	}

	return {
		prepare: (sql: string) => new TestD1Statement(sqlite, sql),
		async batch<T = Row>(statements: TestD1Statement[]): Promise<TestD1Result<T>[]> {
			sqlite.exec('BEGIN');
			try {
				const results = statements.map((statement) => statement.execute<T>());
				sqlite.exec('COMMIT');
				return results;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		},
		async exec(sql: string) {
			sqlite.exec(sql);
			return { count: 1, duration: 0 };
		}
	};
}

export type TestD1 = ReturnType<typeof createTestD1>;
