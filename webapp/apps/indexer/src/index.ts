/**
 * stellar8004 indexer on Cloudflare Workers and D1. Each cron run takes the indexer lock, indexes
 * the identity, reputation and validation contracts from Stellar RPC events, then resolves
 * pending agent URIs, all under that lock.
 */
import { Networks, rpc } from '@stellar/stellar-sdk';
import type { Db } from '@stellar8004/d1';
import { log } from '../../../packages/indexer/src/logger.js';
import { MAINNET_CONFIG } from '../../../packages/indexer/src/sdk-config.js';
import { acquireLock, releaseLock } from './db.js';
import { indexContracts, type IndexResult, type Rpc } from './indexer.js';
import { resolvePending, type ResolveResult } from './resolve.js';

export interface Env {
	DB: Db;
	STELLAR_NETWORK?: string;
	STELLAR_MAINNET_RPC_PRIMARY_URL?: string;
	STELLAR_MAINNET_RPC_FALLBACK_URL?: string;
	/** "true" lets a run skip ledgers that aged out of RPC retention; otherwise such a run fails. */
	ALLOW_RETENTION_CLAMP?: string;
}

// Stop starting new work after this; in-flight requests are bounded by their own timeouts.
const SOFT_BUDGET_MS = 60_000;
const RPC_TIMEOUT_MS = 10_000;
const RPC_PROBE_TIMEOUT_MS = 5_000;

/**
 * Returns the first RPC whose getHealth reports "healthy", or the first URL if none does.
 * A provider that falls behind turns unhealthy, so runs route around it.
 */
export async function pickRpc(urls: string[], fetchFn: typeof fetch = fetch): Promise<string> {
	for (const url of urls) {
		try {
			const res = await fetchFn(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
				signal: AbortSignal.timeout(RPC_PROBE_TIMEOUT_MS)
			});
			const body = (await res.json()) as { result?: { status?: string } };
			if (body.result?.status === 'healthy') return url;
		} catch {
			// Unreachable or not JSON-RPC: try the next one.
		}
	}
	return urls[0];
}

export type RunResult =
	{ skipped: true } | ({ skipped: false; resolve: ResolveResult } & IndexResult);

export async function runOnce(
	env: Env,
	connect: (url: string) => Rpc & Pick<rpc.Server, 'getNetwork'> = (url) =>
		new rpc.Server(url, { timeout: RPC_TIMEOUT_MS }),
	choose: (urls: string[]) => Promise<string> = pickRpc
): Promise<RunResult> {
	if (env.STELLAR_NETWORK !== 'mainnet') {
		throw new Error(
			`Refusing to run: STELLAR_NETWORK is "${env.STELLAR_NETWORK}", expected "mainnet"`
		);
	}
	const urls = [env.STELLAR_MAINNET_RPC_PRIMARY_URL, env.STELLAR_MAINNET_RPC_FALLBACK_URL].filter(
		(url): url is string => !!url
	);
	if (urls.length === 0) throw new Error('No Stellar RPC URL configured');

	const deadlineMs = Date.now() + SOFT_BUDGET_MS;
	const owner = crypto.randomUUID();
	// Overlapping cron runs, or the copy fence before cutover.
	if (!(await acquireLock(env.DB, owner))) return { skipped: true };
	try {
		const server = connect(await choose(urls));
		const { passphrase } = await server.getNetwork();
		if (passphrase !== Networks.PUBLIC) {
			throw new Error(`Refusing to run: RPC network is "${passphrase}", expected mainnet`);
		}
		const indexed = await indexContracts(env.DB, server, MAINNET_CONFIG.contracts, deadlineMs, {
			owner,
			allowRetentionClamp: env.ALLOW_RETENTION_CLAMP === 'true'
		});
		const resolve = await resolvePending(env.DB, deadlineMs);
		return { skipped: false, ...indexed, resolve };
	} finally {
		// A lock left behind goes stale after 180 s; never let a release failure mask the run's result.
		await releaseLock(env.DB, owner).catch((error: unknown) =>
			log({ level: 'error', msg: 'Failed to release the indexer lock', error: String(error) })
		);
	}
}

export default {
	async scheduled(
		_controller: unknown,
		env: Env,
		ctx: { waitUntil(promise: Promise<unknown>): void }
	): Promise<void> {
		ctx.waitUntil(
			runOnce(env).then(
				(result) => log({ level: 'info', msg: 'indexer run', ...result }),
				(error: unknown) => {
					log({ level: 'error', msg: 'indexer run failed', error: String(error) });
					throw error;
				}
			)
		);
	}
};
