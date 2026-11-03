const ATTEMPT_TIMEOUT_MS = 6_000;

/**
 * Supabase sometimes doesn't answer at all. Cloudflare then returns 522 after about 20 s,
 * and the page fails only after hanging that long. Give each attempt 6 s and retry once
 * on a timeout, network error or 5xx.
 *
 * Only requests whose body can be sent again are retried (no body, or a string). Every
 * request the web app makes to Supabase is a read.
 */
export async function fetchWithRetry(
	input: RequestInfo | URL,
	init: RequestInit = {},
	fetchFn: typeof fetch = fetch
): Promise<Response> {
	const attempts = init.body == null || typeof init.body === 'string' ? 2 : 1;
	for (let attempt = 1; ; attempt++) {
		const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
		const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
		try {
			const res = await fetchFn(input, { ...init, signal });
			if (res.status < 500 || attempt === attempts) return res;
			await res.body?.cancel();
		} catch (error) {
			if (attempt === attempts || init.signal?.aborted) throw error;
		}
	}
}
