import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);
// D1 rejects statements with more bound parameters than this.
const MAX_BOUND_PARAMETERS = 100;
// D1's maximum string, BLOB or row size, in bytes.
const MAX_LENGTH = 2_000_000;
// D1's maximum length of one SQL statement, in bytes.
const MAX_STATEMENT_BYTES = 100_000;

function assertStatementSize(sql: string): void {
	if (Buffer.byteLength(sql) > MAX_STATEMENT_BYTES) {
		throw new Error(`D1_ERROR: statement too long (${Buffer.byteLength(sql)} > ${MAX_STATEMENT_BYTES} bytes)`);
	}
}

type Row = Record<string, unknown>;

export interface TestD1Result<T = Row> {
	success: true;
	results: T[];
	meta: { changes: number; last_row_id: number };
}

function toSqlValue(value: unknown): SQLInputValue {
	if (value === undefined || typeof value === 'bigint') {
		throw new TypeError(`D1_TYPE_ERROR: Type "${typeof value}" is not supported`);
	}
	if (typeof value === 'boolean') return value ? 1 : 0;
	if (value === null || typeof value === 'number') return value;
	if (typeof value === 'string' || value instanceof Uint8Array) {
		const bytes = typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength;
		if (bytes > MAX_LENGTH) throw new Error('D1_ERROR: string or blob too big: SQLITE_TOOBIG');
		return value;
	}
	throw new TypeError(`D1_TYPE_ERROR: Type "${typeof value}" is not supported`);
}

// Plain fields rather than constructor parameter properties, so this file also runs under
// Node's built-in TypeScript type stripping (scripts import it directly).
export class TestD1Statement {
	private readonly db: DatabaseSync;
	private readonly sql: string;
	private readonly params: SQLInputValue[];

	constructor(db: DatabaseSync, sql: string, params: SQLInputValue[] = []) {
		this.db = db;
		this.sql = sql;
		this.params = params;
	}

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
 * use, and D1's rules for them: at most 100 bound parameters, no undefined or BigInt
 * bindings, booleans stored as 0/1, values and rows of at most 2,000,000 bytes, foreign
 * keys on, and batch() as one transaction. (The row limit needs a Node whose node:sqlite
 * accepts `limits`; older ones still enforce it per bound value.)
 */
export function createTestD1() {
	const sqlite = new DatabaseSync(':memory:', { limits: { length: MAX_LENGTH } } as ConstructorParameters<
		typeof DatabaseSync
	>[1]);
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
		sqlite.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
	}

	return {
		prepare: (sql: string) => {
			assertStatementSize(sql);
			return new TestD1Statement(sqlite, sql);
		},
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
			// Files are imported statement by statement; every statement here ends a line.
			for (const statement of sql.split(/;[ \t]*\n/)) assertStatementSize(statement);
			sqlite.exec(sql);
			return { count: 1, duration: 0 };
		}
	};
}

export type TestD1 = ReturnType<typeof createTestD1>;
