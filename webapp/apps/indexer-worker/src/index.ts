/**
 * Protocol 30 fallback: runs the (hotfixed) pre-migration-050 indexer on a Cloudflare
 * Cron Trigger and writes to the same Supabase database with the service-role key.
 * It exists for the case where the Supabase-hosted indexer function cannot be
 * redeployed. The cron stays off in wrangler.toml until it is needed.
 *
 * Running next to the Supabase-hosted indexer is safe: runIndexer takes the
 * database lock (acquire_indexer_lock) and its writes are idempotent upserts.
 */
import { getConfig } from '../../../packages/indexer/src/config.js';
import { createSupabaseAdmin, refreshLeaderboard } from '../../../packages/indexer/src/db.js';
import { env } from '../../../packages/indexer/src/env.js';
import { runIndexer, type IndexerResult } from '../../../packages/indexer/src/indexer.js';

const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
// Same budget as the Supabase edge function: stop cleanly well before the platform limit.
const SOFT_BUDGET_MS = 110_000;
// The other writer holds the lock for a few seconds per run; one retry is enough.
const LOCK_RETRY_DELAY_MS = 15_000;

type Run = (options: { deadlineMs: number }) => Promise<IndexerResult>;
type Sleep = (ms: number) => Promise<void>;

const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RPC_PROBE_TIMEOUT_MS = 5_000;

/**
 * Returns the first RPC whose getHealth reports "healthy", or the first URL if none does.
 * A provider that misses the Protocol 30 upgrade stops advancing and turns unhealthy, so
 * runs route around it.
 */
export async function pickRpc(urls: string[], fetchFn: typeof fetch = fetch): Promise<string> {
	for (const url of urls) {
		try {
			const res = await fetchFn(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
				signal: AbortSignal.timeout(RPC_PROBE_TIMEOUT_MS),
			});
			const body = (await res.json()) as { result?: { status?: string } };
			if (body.result?.status === 'healthy') return url;
		} catch {
			// Unreachable or not JSON-RPC: try the next one.
		}
	}
	return urls[0];
}

export async function runOnce(
	run: Run = runIndexer,
	wait: Sleep = sleep,
	choose: (urls: string[]) => Promise<string> = pickRpc,
): Promise<IndexerResult> {
	// getConfig() reads STELLAR_MAINNET_RPC_URL. Set it for this run from the two configured
	// providers, so the primary stays primary across runs.
	const rpcs = [env('STELLAR_MAINNET_RPC_PRIMARY_URL'), env('STELLAR_MAINNET_RPC_FALLBACK_URL')].filter(
		(url): url is string => url !== undefined,
	);
	const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	if (rpcs.length > 0 && processEnv) processEnv.STELLAR_MAINNET_RPC_URL = await choose(rpcs);

	const { networkPassphrase } = getConfig();
	if (networkPassphrase !== MAINNET_PASSPHRASE) {
		// getConfig() falls back to testnet when STELLAR_NETWORK is unset, which would
		// quietly index the wrong network. Refuse instead.
		throw new Error(`Refusing to run: expected mainnet, got "${networkPassphrase}"`);
	}

	const deadlineMs = Date.now() + SOFT_BUDGET_MS;
	let result = await run({ deadlineMs });
	if (result.skipped) {
		await wait(LOCK_RETRY_DELAY_MS);
		result = await run({ deadlineMs });
	}
	return result;
}

export default {
	async scheduled(
		_controller: unknown,
		_env: unknown,
		ctx: { waitUntil(promise: Promise<unknown>): void },
	): Promise<void> {
		ctx.waitUntil(
			runOnce().then(
				async (r) => {
					console.log(
						JSON.stringify({
							msg: 'indexer run',
							processed: r.processed,
							errors: r.errors,
							skipped: r.skipped ?? false,
							timedOut: r.timedOut ?? false,
							gaps: r.gaps.length,
						}),
					);
					// /api/v1/search reads the leaderboard view, which the indexer only refreshes after
					// feedback and validation events, so new agents and resolved names never showed up
					// there. Refresh it every run; the database function itself runs at most every 2 min.
					await refreshLeaderboard(createSupabaseAdmin()).catch((error: unknown) =>
						console.error(JSON.stringify({ msg: 'leaderboard refresh failed', error: String(error) })),
					);
				},
				(error: unknown) => {
					console.error(JSON.stringify({ msg: 'indexer run failed', error: String(error) }));
					throw error;
				},
			),
		);
	},
};
