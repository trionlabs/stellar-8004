import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ExplorerClient,
	NotFoundError,
	RateLimitError,
	type ApiResponse
} from '../src/api/explorer.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'content-type': 'application/json'
		},
		...init
	});
}

function buildEnvelope<T>(data: T): ApiResponse<T> {
	return {
		success: true,
		data,
		meta: {
			version: '1.0.0',
			chain: 'stellar',
			network: 'testnet',
			timestamp: '2026-04-07T00:00:00.000Z',
			requestId: 'req-123'
		}
	};
}

describe('ExplorerClient', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('requests agents and enriches pagination helpers', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				...buildEnvelope([
					{
						id: 1,
						owner: 'GOWNER',
						agent_uri_data: {
							name: 'Nova'
						},
						supported_trust: ['reputation'],
						services: [{ name: 'A2A', endpoint: 'https://example.com' }]
					}
				]),
				meta: {
					...buildEnvelope(null).meta,
					pagination: {
						page: 1,
						limit: 10,
						total: 25,
						hasMore: true
					}
				}
			})
		);

		vi.stubGlobal('fetch', fetchMock);

		const client = new ExplorerClient('https://stellar8004.com');
		const response = await client.getAgents({ page: 1, limit: 10 });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0].toString()).toBe(
			'https://stellar8004.com/api/v1/agents?page=1&limit=10'
		);
		expect(response.data[0]).toMatchObject({
			id: 1,
			name: 'Nova',
			owner: 'GOWNER',
			supportedTrust: ['reputation']
		});
		expect(response.meta.pagination).toEqual({
			page: 1,
			limit: 10,
			total: 25,
			hasMore: true,
			nextPage: 2
		});
	});

	it('retries on 429 using Retry-After before succeeding', async () => {
		vi.useFakeTimers();

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse(
					{ error: { message: 'slow down' } },
					{
						status: 429,
						headers: {
							'content-type': 'application/json',
							'Retry-After': '2'
						}
					}
				)
			)
			.mockResolvedValueOnce(jsonResponse(buildEnvelope({ totalAgents: 42 })));

		vi.stubGlobal('fetch', fetchMock);

		const client = new ExplorerClient('https://stellar8004.com');
		const promise = client.getStats();

		await vi.runAllTimersAsync();
		await expect(promise).resolves.toMatchObject({
			data: { totalAgents: 42 }
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('throws RateLimitError after exhausting retries', async () => {
		vi.useFakeTimers();

		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse(
				{ error: { message: 'still limited' } },
				{
					status: 429,
					headers: {
						'content-type': 'application/json',
						'Retry-After': '1'
					}
				}
			)
		);

		vi.stubGlobal('fetch', fetchMock);

		const client = new ExplorerClient('https://stellar8004.com', { retries: 3 });
		const promise = client.getStats();
		const assertion = expect(promise).rejects.toBeInstanceOf(RateLimitError);

		await vi.runAllTimersAsync();
		await assertion;
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it('throws NotFoundError without retrying on 404', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse(
				{ error: { message: 'missing' } },
				{
					status: 404,
					headers: {
						'content-type': 'application/json'
					}
				}
			)
		);

		vi.stubGlobal('fetch', fetchMock);

		const client = new ExplorerClient('https://stellar8004.com');

		await expect(client.getAgent(404)).rejects.toBeInstanceOf(NotFoundError);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('retries abort errors and then succeeds', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);

		const abortError = new DOMException('The operation was aborted', 'AbortError');
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(abortError)
			.mockResolvedValueOnce(jsonResponse(buildEnvelope({ status: 'healthy' })));

		vi.stubGlobal('fetch', fetchMock);

		const client = new ExplorerClient('https://stellar8004.com', { retries: 3 });
		const promise = client.health();

		await vi.runAllTimersAsync();
		await expect(promise).resolves.toMatchObject({
			data: { status: 'healthy' }
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('retries 5xx responses with backoff and jitter', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse(
					{ error: { message: 'server exploded' } },
					{
						status: 503,
						headers: {
							'content-type': 'application/json'
						}
					}
				)
			)
			.mockResolvedValueOnce(jsonResponse(buildEnvelope([])));

		vi.stubGlobal('fetch', fetchMock);

		const client = new ExplorerClient('https://stellar8004.com');
		const promise = client.search('nova');

		await vi.runAllTimersAsync();
		await expect(promise).resolves.toMatchObject({
			data: []
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
