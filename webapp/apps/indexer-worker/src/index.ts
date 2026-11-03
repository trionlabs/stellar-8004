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
import { runIndexer, type IndexerResult } from '../../../packages/indexer/src/indexer.js';

const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
// Same budget as the Supabase edge function: stop cleanly well before the platform limit.
const SOFT_BUDGET_MS = 110_000;
// The other writer holds the lock for a few seconds per run; one retry is enough.
const LOCK_RETRY_DELAY_MS = 15_000;

type Run = (options: { deadlineMs: number }) => Promise<IndexerResult>;
type Sleep = (ms: number) => Promise<void>;

const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runOnce(run: Run = runIndexer, wait: Sleep = sleep): Promise<IndexerResult> {
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
				(r) =>
					console.log(
						JSON.stringify({
							msg: 'indexer run',
							processed: r.processed,
							errors: r.errors,
							skipped: r.skipped ?? false,
							timedOut: r.timedOut ?? false,
							gaps: r.gaps.length,
						}),
					),
				(error: unknown) => {
					console.error(JSON.stringify({ msg: 'indexer run failed', error: String(error) }));
					throw error;
				},
			),
		);
	},
};
