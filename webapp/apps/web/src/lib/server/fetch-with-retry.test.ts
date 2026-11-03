import { describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from './fetch-with-retry.js';

const ok = () => new Response('ok', { status: 200 });
const timedOut = () => new Response('error code: 522', { status: 522 });

describe('fetchWithRetry', () => {
	it('retries once after a network error or timeout', async () => {
		const fetchFn = vi.fn().mockRejectedValueOnce(new Error('timed out')).mockResolvedValueOnce(ok());
		const res = await fetchWithRetry('https://db.example/rest/v1/agents', {}, fetchFn);
		expect(res.status).toBe(200);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('retries a 5xx such as a Cloudflare 522', async () => {
		const fetchFn = vi.fn().mockResolvedValueOnce(timedOut()).mockResolvedValueOnce(ok());
		const res = await fetchWithRetry('https://db.example/rest/v1/agents', {}, fetchFn);
		expect(res.status).toBe(200);
	});

	it('returns the last 5xx when both attempts fail', async () => {
		const fetchFn = vi.fn().mockResolvedValue(timedOut());
		const res = await fetchWithRetry('https://db.example/rest/v1/agents', {}, fetchFn);
		expect(res.status).toBe(522);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('does not retry a 4xx', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
		await fetchWithRetry('https://db.example/rest/v1/agents', {}, fetchFn);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('does not retry a request whose body is a stream', async () => {
		const fetchFn = vi.fn().mockRejectedValue(new Error('timed out'));
		const body = new Response('x').body;
		await expect(
			fetchWithRetry('https://db.example/functions/v1/api', { method: 'POST', body }, fetchFn)
		).rejects.toThrow('timed out');
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('gives every attempt its own timeout signal', async () => {
		const fetchFn = vi.fn().mockResolvedValue(ok());
		await fetchWithRetry('https://db.example/rest/v1/agents', {}, fetchFn);
		expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
	});
});
