import type { ServiceEntry } from '../core/types.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 3;

export interface PaginationMeta {
	page: number;
	limit: number;
	total: number;
	hasMore: boolean;
}

export interface ApiMeta {
	version: string;
	chain: string;
	network: string;
	timestamp: string;
	requestId: string;
	pagination?: PaginationMeta;
	[key: string]: unknown;
}

export interface ApiResponse<T> {
	success: boolean;
	data: T;
	meta: ApiMeta;
}

export interface AgentResponse {
	id: number;
	name?: string | null;
	description?: string | null;
	image?: string | null;
	owner: string;
	wallet?: string | null;
	agentUri?: string | null;
	supportedTrust?: string[];
	services?: ServiceEntry[];
	x402Enabled?: boolean;
	hasServices?: boolean;
	createdAt?: string;
	createdLedger?: number | null;
	txHash?: string | null;
	totalScore?: number | null;
	avgScore?: number | null;
	feedbackCount?: number;
	uniqueClients?: number;
	/** Only present in detail responses (getAgent) */
	metadata?: Record<string, string>;
	/** Only present in detail responses (getAgent) */
	scores?: {
		total: number;
		average: number;
		feedbackCount: number;
		uniqueClients: number;
	};
	/** Only present in detail responses (getAgent) */
	resolveStatus?: 'ready' | 'resolving' | 'no-uri';
	[key: string]: unknown;
}

export interface FeedbackReplyResponse {
	responder: string;
	responseUri: string | null;
	createdAt: string;
	[key: string]: unknown;
}

export interface FeedbackResponse {
	feedbackIndex: number;
	clientAddress: string;
	value: number | string | null;
	valueDecimals?: number;
	tag1?: string | null;
	tag2?: string | null;
	endpoint?: string | null;
	feedbackUri?: string | null;
	isRevoked?: boolean;
	createdAt: string;
	responses?: FeedbackReplyResponse[];
	[key: string]: unknown;
}

export interface StatsResponse {
	totalAgents: number;
	totalFeedbacks: number;
	totalValidations: number;
	totalUniqueClients: number;
	averageFeedbackScore: number;
	agentsWithServices: number;
	agentsWithX402: number;
	network: string;
	protocolDistribution: { a2a: number; mcp: number; other: number };
	trustDistribution: { reputation: number; validation: number; tee: number };
	[key: string]: unknown;
}

export interface IndexerStatus {
	lastLedger: number;
	stale: boolean;
}

export interface HealthResponse {
	status: string;
	indexer: {
		identity: IndexerStatus;
		reputation: IndexerStatus;
		validation: IndexerStatus;
	};
	network: string;
	[key: string]: unknown;
}

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly body?: unknown
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export class RateLimitError extends ApiError {
	constructor(public readonly retryAfterMs: number, body?: unknown) {
		super(429, `Rate limited. Retry after ${retryAfterMs}ms`, body);
		this.name = 'RateLimitError';
	}
}

export class NotFoundError extends ApiError {
	constructor(resource: string, body?: unknown) {
		super(404, `${resource} not found`, body);
		this.name = 'NotFoundError';
	}
}

export class ValidationError extends ApiError {
	constructor(message: string, body?: unknown) {
		super(400, message, body);
		this.name = 'ValidationError';
	}
}

export interface ExplorerClientOptions {
	timeout?: number;
	retries?: number;
	fetch?: typeof fetch;
}

interface RequestOptions {
	params?: Record<string, string | number | boolean | undefined>;
	resource?: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(): number {
	return Math.floor(Math.random() * 250);
}

function toCamelCase(value: string): string {
	return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function normalizeServices(raw: unknown): ServiceEntry[] | undefined {
	if (!Array.isArray(raw)) return undefined;

	return raw
		.filter((service): service is Record<string, unknown> => service != null && typeof service === 'object')
		.map((service) => ({
			name: typeof service.name === 'string' ? service.name : 'unknown',
			endpoint: typeof service.endpoint === 'string' ? service.endpoint : '',
			version: typeof service.version === 'string' ? service.version : undefined
		}))
		.filter((service) => service.endpoint.length > 0);
}

function normalizeRecord(record: unknown): unknown {
	if (Array.isArray(record)) {
		return record.map((entry) => normalizeRecord(entry));
	}

	if (record == null || typeof record !== 'object') {
		return record;
	}

	const source = record as Record<string, unknown>;
	const normalized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(source)) {
		const camelKey = toCamelCase(key);
		normalized[camelKey] = normalizeRecord(value);
	}

	if ('agentUriData' in normalized) {
		const uriData = normalized.agentUriData;
		if (uriData && typeof uriData === 'object' && !Array.isArray(uriData)) {
			const recordUriData = uriData as Record<string, unknown>;
			if (typeof recordUriData.name === 'string' && !('name' in normalized)) {
				normalized.name = recordUriData.name;
			}
			if (typeof recordUriData.description === 'string' && !('description' in normalized)) {
				normalized.description = recordUriData.description;
			}
			if (typeof recordUriData.image === 'string' && !('image' in normalized)) {
				normalized.image = recordUriData.image;
			}
		}
	}

	if ('services' in normalized) {
		normalized.services = normalizeServices(normalized.services) ?? normalized.services;
	}

	if ('supportedTrust' in normalized && !Array.isArray(normalized.supportedTrust)) {
		normalized.supportedTrust = [];
	}

	return normalized;
}

function normalizePagination(meta: ApiMeta): ApiMeta {
	if (!meta.pagination) return meta;

	const page = Number(meta.pagination.page ?? 1);
	const limit = Number(meta.pagination.limit ?? 0);
	const total = Number(meta.pagination.total ?? 0);
	const hasMore =
		typeof meta.pagination.hasMore === 'boolean'
			? meta.pagination.hasMore
			: limit > 0
				? page * limit < total
				: false;

	return {
		...meta,
		pagination: {
			page,
			limit,
			total,
			hasMore
		}
	};
}

function parseRetryAfterMs(headers: Headers): number | null {
	const retryAfter = headers.get('Retry-After');
	if (retryAfter) {
		if (/^\d+$/.test(retryAfter)) {
			return Number(retryAfter) * 1000;
		}

		const retryAt = Date.parse(retryAfter);
		if (Number.isFinite(retryAt)) {
			return Math.max(0, retryAt - Date.now());
		}
	}

	const resetHeader = headers.get('X-RateLimit-Reset');
	if (resetHeader && /^\d+$/.test(resetHeader)) {
		const raw = Number(resetHeader);
		const resetAt = raw > 1_000_000_000_000 ? raw : raw * 1000;
		return Math.max(0, resetAt - Date.now());
	}

	return null;
}

async function readResponseBody(response: Response): Promise<unknown> {
	const contentType = response.headers.get('content-type') ?? '';

	if (contentType.includes('application/json')) {
		try {
			return await response.json();
		} catch {
			return null;
		}
	}

	try {
		return await response.text();
	} catch {
		return null;
	}
}

function extractErrorMessage(body: unknown, fallback: string): string {
	if (typeof body === 'string' && body.length > 0) return body;
	if (body && typeof body === 'object') {
		const source = body as Record<string, unknown>;
		if (typeof source.message === 'string') return source.message;
		if (source.error && typeof source.error === 'object') {
			const nested = source.error as Record<string, unknown>;
			if (typeof nested.message === 'string') return nested.message;
		}
	}

	return fallback;
}

function buildSignal(timeoutMs: number): AbortSignal {
	if (typeof AbortSignal.timeout === 'function') {
		return AbortSignal.timeout(timeoutMs);
	}

	// Fallback for older runtimes — timer is cleaned up via AbortSignal.addEventListener
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	// Clear timer if the signal is aborted by another source (e.g., request completes)
	if (typeof timer === 'object' && 'unref' in timer) {
		(timer as NodeJS.Timeout).unref();
	}
	return controller.signal;
}

export class ExplorerClient {
	private readonly timeout: number;
	private readonly retries: number;
	private readonly fetchImpl: typeof fetch;

	constructor(
		private readonly baseUrl: string,
		options: ExplorerClientOptions = {}
	) {
		this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
		this.retries = options.retries ?? DEFAULT_RETRIES;
		this.fetchImpl = options.fetch ?? fetch;
	}

	async getAgents(params?: {
		page?: number;
		limit?: number;
		search?: string;
		trust?: string;
		minScore?: number;
		hasServices?: boolean;
		x402?: boolean;
		sortBy?: 'created_at' | 'id';
		sortOrder?: 'asc' | 'desc';
	}) {
		return this.request<AgentResponse[]>('/api/v1/agents', {
			params,
			resource: 'Agent list'
		});
	}

	async getAgent(id: number) {
		return this.request<AgentResponse>(`/api/v1/agents/${id}`, {
			resource: `Agent ${id}`
		});
	}

	async getFeedback(agentId: number, params?: { page?: number; tag?: string }) {
		return this.request<FeedbackResponse[]>(`/api/v1/agents/${agentId}/feedback`, {
			params,
			resource: `Feedback for agent ${agentId}`
		});
	}

	async getAgentsByAddress(address: string) {
		return this.request<AgentResponse[]>(
			`/api/v1/accounts/${encodeURIComponent(address)}/agents`,
			{
				resource: `Agents for ${address}`
			}
		);
	}

	async search(q: string, params?: { limit?: number; trust?: string; minScore?: number }) {
		return this.request<AgentResponse[]>('/api/v1/search', {
			params: { ...params, q },
			resource: `Search results for "${q}"`
		});
	}

	async getStats() {
		return this.request<StatsResponse>('/api/v1/stats', {
			resource: 'Stats'
		});
	}

	async health() {
		return this.request<HealthResponse>('/api/v1/health', {
			resource: 'Health'
		});
	}

	private async request<T>(
		path: string,
		options: RequestOptions = {}
	): Promise<ApiResponse<T>> {
		for (let attempt = 0; attempt <= this.retries; attempt += 1) {
			try {
				const url = new URL(path, this.baseUrl);
				for (const [key, value] of Object.entries(options.params ?? {})) {
					if (value !== undefined) {
						url.searchParams.set(key, String(value));
					}
				}

				const response = await this.fetchImpl(url, {
					signal: buildSignal(this.timeout)
				});

				if (response.ok) {
					let body: ApiResponse<T>;
					try {
						body = (await response.json()) as ApiResponse<T>;
					} catch {
						throw new ApiError(response.status, 'Invalid JSON in response');
					}

					if (body.success === false) {
						throw new ApiError(
							response.status,
							'API request failed',
							body
						);
					}

					const normalizedMeta = normalizePagination(
						normalizeRecord(body.meta) as ApiMeta
					);

					return {
						...body,
						data: normalizeRecord(body.data) as T,
						meta: normalizedMeta
					};
				}

				const body = await readResponseBody(response);

				if (response.status === 429) {
					const retryAfterMs = parseRetryAfterMs(response.headers) ?? 1000 * 2 ** attempt;

					if (attempt < this.retries) {
						await sleep(retryAfterMs);
						continue;
					}

					throw new RateLimitError(retryAfterMs, body);
				}

				if (response.status >= 500) {
					if (attempt < this.retries) {
						await sleep(1000 * 2 ** attempt + jitter());
						continue;
					}

					throw new ApiError(
						response.status,
						extractErrorMessage(body, 'Server error'),
						body
					);
				}

				if (response.status === 404) {
					throw new NotFoundError(options.resource ?? 'Resource', body);
				}

				if (response.status === 400) {
					throw new ValidationError(
						extractErrorMessage(body, 'Invalid request parameters'),
						body
					);
				}

				throw new ApiError(
					response.status,
					extractErrorMessage(body, `Request failed with status ${response.status}`),
					body
				);
			} catch (error) {
				if (!this.isRetriableNetworkError(error) || attempt >= this.retries) {
					throw error;
				}

				await sleep(1000 * 2 ** attempt + jitter());
			}
		}

		throw new ApiError(0, 'Request failed after retries');
	}

	private isRetriableNetworkError(error: unknown): boolean {
		if (!(error instanceof Error)) return false;
		if (error instanceof ApiError) return false;
		return error.name === 'AbortError' || error instanceof TypeError;
	}
}

