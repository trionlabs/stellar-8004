// GET /api/v2/discovery (#18): strict parameters and keyset pagination, so a client such as
// the stellar-agent-search MCP can walk the whole registry page by page without offsets.
// ponytail: the walk reads the live tables, not an immutable snapshot, and the cursor is
// encoded but not signed; add projection revisions and an HMAC if clients need either.
import { env } from '$env/dynamic/public';
import { decodeRow, type Db } from '$lib/server/d1.js';
import { ftsMatch } from '$lib/server/search.js';
import { AGENTS, FTS_MATCH, TRUST_OVERLAP, indexerStatus, trustValues } from './handlers.js';
import { errorResponse, formatAgent, successWithCache } from './response.js';

type Row = Record<string, unknown>;
type Key = [number | string, number];

const PARAMS = new Set([
	'network',
	'text',
	'x402',
	'mpp',
	'hasServices',
	'trust',
	'minScore',
	'sort',
	'limit',
	'cursor'
]);
const FLAGS = { x402: 'a.x402_enabled', mpp: 'a.mpp_enabled' } as const;

// Discovery score: the leaderboard average clamped to 0-100. Feedback values may legally reach
// 1e38, so the raw average must not decide the order on its own.
const SCORE = 'min(max(COALESCE(x.total_score, 0), 0), 100)';

// Every order ends in the id, so it is total and a (key, id) pair marks a unique position.
const SORTS = {
	score: {
		order: 'ORDER BY a.score DESC, a.id ASC',
		after: ([v, id]: Key) => ['(a.score < ? OR (a.score = ? AND a.id > ?))', [v, v, id]] as const,
		key: (row: Row): Key => [Number(row.score), Number(row.id)]
	},
	newest: {
		order: 'ORDER BY a.created_at DESC, a.id DESC',
		after: ([v, id]: Key) =>
			['(a.created_at < ? OR (a.created_at = ? AND a.id < ?))', [v, v, id]] as const,
		key: (row: Row): Key => [String(row.created_at), Number(row.id)]
	},
	id: {
		order: 'ORDER BY a.id ASC',
		after: ([, id]: Key) => ['a.id > ?', [id]] as const,
		key: (row: Row): Key => [Number(row.id), Number(row.id)]
	}
} as const;
type Sort = keyof typeof SORTS;

const bad = (message: string) => errorResponse('INVALID_PARAM', message, 400);

function flag(value: string | null): boolean | null | undefined {
	if (value === null) return null;
	return value === 'true' ? true : value === 'false' ? false : undefined;
}

const encodeCursor = (query: string, key: Key) =>
	btoa(JSON.stringify({ q: query, k: key }))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

function decodeCursor(cursor: string, query: string, sort: Sort): Key | null {
	try {
		const { q, k } = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
		const keyType = sort === 'newest' ? 'string' : 'number';
		const valid =
			q === query &&
			Array.isArray(k) &&
			k.length === 2 &&
			typeof k[0] === keyType &&
			Number.isSafeInteger(k[1]);
		return valid ? (k as Key) : null;
	} catch {
		return null;
	}
}

export async function handleDiscovery(db: Db, url: URL): Promise<Response> {
	const params = url.searchParams;
	for (const name of new Set(params.keys())) {
		if (!PARAMS.has(name)) return bad(`Unknown parameter "${name}"`);
		if (params.getAll(name).length > 1) return bad(`Parameter "${name}" is repeated`);
	}

	const network = params.get('network');
	if (!network) return bad('Parameter "network" is required');
	if (network !== env.PUBLIC_STELLAR_NETWORK) {
		return bad(`This explorer indexes ${env.PUBLIC_STELLAR_NETWORK}, not "${network}"`);
	}

	const sort = (params.get('sort') ?? 'score') as Sort;
	if (!Object.hasOwn(SORTS, sort)) return bad('Parameter "sort" must be score, newest or id');

	const limitParam = params.get('limit') ?? '20';
	const limit = Number(limitParam);
	if (!/^\d+$/.test(limitParam) || limit < 1 || limit > 100) {
		return bad('Parameter "limit" must be an integer from 1 to 100');
	}

	const where: string[] = [];
	const args: unknown[] = [];

	const text = params.get('text');
	if (text !== null) {
		if (text.trim() === '') return bad('Parameter "text" must not be empty');
		const match = ftsMatch(text);
		// Only stopwords: nothing can match.
		if (match === null) where.push('0');
		else {
			where.push(FTS_MATCH);
			args.push(match);
		}
	}
	for (const [name, column] of [...Object.entries(FLAGS), ['hasServices', null]] as const) {
		const value = flag(params.get(name));
		if (value === undefined) return bad(`Parameter "${name}" must be true or false`);
		if (value === null) continue;
		where.push(
			column
				? `${column} = ${value ? 1 : 0}`
				: `json_array_length(a.services) ${value ? '>' : '='} 0`
		);
	}
	const trust = params.get('trust');
	if (trust !== null) {
		if (trust.trim() === '') return bad('Parameter "trust" must not be empty');
		where.push(TRUST_OVERLAP);
		args.push(trustValues(trust));
	}
	const minScoreParam = params.get('minScore');
	if (minScoreParam !== null) {
		const minScore = Number(minScoreParam);
		if (minScoreParam.trim() === '' || !(minScore >= 0 && minScore <= 100)) {
			return bad('Parameter "minScore" must be a number from 0 to 100');
		}
		where.push('a.score >= ?');
		args.push(minScore);
	}

	// The cursor belongs to one query: every parameter except the cursor and the page size.
	const query = [...params]
		.filter(([name]) => name !== 'cursor' && name !== 'limit')
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, value]) => `${name}=${value}`)
		.join('&');
	const cursor = params.get('cursor');
	if (cursor !== null) {
		const key = decodeCursor(cursor, query, sort);
		if (!key)
			return errorResponse('INVALID_CURSOR', 'Cursor is malformed or from another query', 400);
		const [sql, values] = SORTS[sort].after(key);
		where.push(sql);
		args.push(...values);
	}

	const indexer = await indexerStatus(db);
	const contracts = Object.values(indexer);
	if (contracts.some((c) => c.stale)) {
		return errorResponse('INDEX_STALE', 'The index is behind the chain; try again shortly', 503);
	}

	const filter = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
	const { results } = await db
		.prepare(
			`SELECT * FROM (SELECT x.*, ${SCORE} AS score FROM (${AGENTS}) x) a
			${filter} ${SORTS[sort].order} LIMIT ?`
		)
		.bind(...args, limit + 1)
		.all();

	const rows = results.slice(0, limit).map((row) => decodeRow<Row>(row));
	const hasMore = results.length > limit;
	const last = rows.at(-1);
	const items = rows.map((row) => ({ ...formatAgent(row, row), score: row.score }));
	return successWithCache(items, 30, 120, {
		version: '2.0.0',
		pagination: {
			limit,
			hasMore,
			nextCursor: hasMore && last ? encodeCursor(query, SORTS[sort].key(last)) : null
		},
		asOfLedger: Math.min(...contracts.map((c) => c.lastLedger)),
		indexedAt:
			contracts
				.map((c) => c.updatedAt)
				.filter(Boolean)
				.sort()
				.at(0) ?? null,
		coverage: { scope: 'indexed_projection', queryComplete: true, snapshot: false }
	});
}
