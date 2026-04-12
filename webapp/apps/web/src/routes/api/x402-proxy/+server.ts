import { json, error } from '@sveltejs/kit';
import { lookup } from 'dns/promises';
import type { RequestHandler } from './$types';

const PRIVATE_IP_PATTERNS = [
	/^10\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
	/^127\./,
	/^169\.254\./,
	/^0\./,
	/^::1$/,
	/^fc/i,
	/^fe80:/i,
	/^fd/i
];

function isPrivateIp(ip: string): boolean {
	return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

async function validateUrl(url: string): Promise<void> {
	const parsed = new URL(url);

	if (parsed.protocol !== 'https:') {
		throw new Error('Only HTTPS URLs are allowed');
	}

	if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
		throw new Error('Private addresses are not allowed');
	}

	// DNS resolve to catch DNS rebinding attacks
	const { address } = await lookup(parsed.hostname);
	if (isPrivateIp(address)) {
		throw new Error('Private IP addresses are not allowed');
	}
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const TIMEOUT_MS = 30_000;

export const POST: RequestHandler = async ({ request }) => {
	let payload: { url: string; method?: string; headers?: Record<string, string>; body?: string };

	try {
		payload = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { url, method = 'GET', headers = {}, body } = payload;

	if (!url || typeof url !== 'string') {
		throw error(400, 'Missing or invalid url');
	}

	try {
		await validateUrl(url);
	} catch (err) {
		throw error(403, err instanceof Error ? err.message : 'URL validation failed');
	}

	if (body && body.length > MAX_BODY_SIZE) {
		throw error(413, 'Request body too large');
	}

	try {
		const response = await fetch(url, {
			method,
			headers,
			body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
			redirect: 'manual', // Don't follow redirects — prevents redirect-to-internal-IP SSRF
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});

		// Reject redirects (could redirect to internal IP)
		if (response.status >= 300 && response.status < 400) {
			return json({
				status: response.status,
				headers: {},
				body: '',
				error: 'Redirects are not followed for security reasons'
			});
		}

		const responseBody = await response.text();
		const responseHeaders: Record<string, string> = {};
		response.headers.forEach((v, k) => {
			responseHeaders[k] = v;
		});

		return json({
			status: response.status,
			headers: responseHeaders,
			body: responseBody
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === 'TimeoutError') {
			throw error(504, 'Request timed out after 30 seconds');
		}
		throw error(502, err instanceof Error ? err.message : 'Proxy request failed');
	}
};
