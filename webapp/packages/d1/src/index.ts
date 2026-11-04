/**
 * The part of Cloudflare's D1Database binding this app uses. The real binding and
 * createTestD1() from ./test-db both satisfy it, so code typed against it runs in Workers
 * and in Node unit tests alike.
 */
export interface Db {
	prepare(sql: string): DbStatement;
	batch<T = Record<string, unknown>>(statements: DbStatement[]): Promise<DbResult<T>[]>;
}

export interface DbStatement {
	bind(...values: unknown[]): DbStatement;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	first<T = unknown>(column: string): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<DbResult<T>>;
	run<T = Record<string, unknown>>(): Promise<DbResult<T>>;
	raw<T = unknown[]>(): Promise<T[]>;
}

export interface DbResult<T> {
	success: boolean;
	results: T[];
	meta: { changes?: number; last_row_id?: number } & Record<string, unknown>;
}
