/**
 * Workers rate limiting binding (API_RATE_LIMITER in wrangler.toml: 30 requests per 60 s per
 * key). The key is read lazily so a failing lookup also fails open, as the old limiters did.
 */
export async function withinRateLimit(
	platform: App.Platform | undefined,
	key: () => string
): Promise<boolean> {
	try {
		const outcome = await platform?.env.API_RATE_LIMITER.limit({ key: key() });
		return outcome?.success ?? true;
	} catch (err) {
		console.error('[rate-limit] binding failed, allowing request:', err);
		return true;
	}
}
