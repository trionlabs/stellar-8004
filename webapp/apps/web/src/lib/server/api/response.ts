// Port of supabase/functions/api/lib/response.ts. The JSON built here is the public API
// contract that the SDK's ExplorerClient and the stellar-agent-search CLI parse: keep key
// order, defaults, sanitizing and Cache-Control values as they are.
import { env } from '$env/dynamic/public';

type Row = Record<string, unknown>;

function meta(extra: Row = {}): Row {
	return {
		version: '1.0.0',
		chain: 'stellar',
		network: env.PUBLIC_STELLAR_NETWORK,
		timestamp: new Date().toISOString(),
		requestId: crypto.randomUUID(),
		...extra
	};
}

export function successWithCache(
	data: unknown,
	maxAge: number,
	swr: number,
	extra: Row = {}
): Response {
	return new Response(JSON.stringify({ success: true, data, meta: meta(extra) }), {
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${swr}`
		}
	});
}

export function errorResponse(code: string, message: string, status: number): Response {
	return new Response(JSON.stringify({ success: false, error: { code, message }, meta: meta() }), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
}

export function paginate(total: number, page: number, limit: number) {
	return { page, limit, total, hasMore: page * limit < total };
}

export function parseIntParam(
	value: string | null,
	defaultVal: number,
	min: number,
	max: number
): number {
	if (!value) return defaultVal;
	const n = parseInt(value, 10);
	if (isNaN(n)) return defaultVal;
	return Math.max(min, Math.min(max, n));
}

// Agent URI data is attacker-controlled and served over a CORS:* API, so string fields are
// escaped and length-capped for downstream HTML consumers.
function sanitizeString(val: unknown, maxLen = 2048): string | null {
	if (typeof val !== 'string') return null;
	return val
		.slice(0, maxLen)
		.replace(/[<>"]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

function normalizeServices(raw: unknown) {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((s): s is Row => s != null && typeof s === 'object')
		.map((s) => ({
			name: sanitizeString(s.name, 256) ?? 'unknown',
			endpoint: sanitizeString(s.endpoint, 2048) ?? '',
			version: sanitizeString(s.version, 64) ?? undefined,
			description: sanitizeString(s.description, 2048) ?? undefined,
			inputExample: sanitizeString(s.inputExample, 4096) ?? undefined
		}))
		.filter((s) => s.endpoint.length > 0);
}

function readUriData(row: Row, field: string): unknown {
	const data = row.agent_uri_data;
	if (data && typeof data === 'object' && !Array.isArray(data)) return (data as Row)[field];
	return undefined;
}

/** `row` is a decoded agents row; `scores` a leaderboard_scores row (both snake_case). */
export function formatAgent(row: Row, scores?: Row | null): Row {
	const result: Row = {
		id: row.id,
		owner: row.owner,
		name: sanitizeString(readUriData(row, 'name')) ?? `Agent #${row.id}`,
		description: sanitizeString(readUriData(row, 'description')) ?? null,
		image: sanitizeString(readUriData(row, 'image'), 4096) ?? null,
		supportedTrust: row.supported_trust ?? [],
		x402Enabled: row.x402_enabled ?? false,
		mppEnabled: row.mpp_enabled ?? false,
		hasServices: Array.isArray(row.services) && row.services.length > 0,
		createdAt: row.created_at
	};
	if (scores) {
		result.totalScore = scores.total_score ?? 0;
		result.avgScore = scores.avg_score ?? 0;
		result.feedbackCount = scores.feedback_count ?? 0;
		result.uniqueClients = scores.unique_clients ?? 0;
	}
	return result;
}

export function formatAgentDetail(row: Row, scores: Row | null, metadataRows: Row[]): Row {
	const result = formatAgent(row, scores);
	result.wallet = row.wallet ?? null;
	result.agentUri = row.agent_uri ?? null;
	result.services = normalizeServices(row.services);
	result.metadata = Object.fromEntries(metadataRows.map((m) => [m.key, m.value ?? '']));
	if (scores) {
		result.scores = {
			total: scores.total_score ?? 0,
			average: scores.avg_score ?? 0,
			feedbackCount: scores.feedback_count ?? 0,
			uniqueClients: scores.unique_clients ?? 0
		};
	}
	result.resolveStatus = row.agent_uri_data ? 'ready' : row.agent_uri ? 'resolving' : 'no-uri';
	result.createdLedger = row.created_ledger ?? null;
	result.txHash = row.tx_hash ?? null;
	return result;
}
