import { getDb } from '$lib/server/d1.js';
import type { LayoutServerLoad } from './$types';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
// Every page waits on this load, so a slow database must not hold pages up.
const QUERY_TIMEOUT_MS = 1_500;

type IndexerStateRow = { last_ledger: number; updated_at: string; last_advanced_at: string | null };

export const load: LayoutServerLoad = async ({ platform }) => {
	// G3: expose the mirror's own freshness so users can distinguish a
	// stale/lagging indexer from a censored one. Never break the layout —
	// any error or a slow answer degrades to indexerStatus: null.
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		// Handled here, not by the outer catch: when the timeout wins, a later rejection would
		// otherwise be an unhandled one.
		const query = getDb(platform)
			.prepare('SELECT last_ledger, updated_at, last_advanced_at FROM indexer_state')
			.all<IndexerStateRow>()
			.catch((error: unknown) => {
				console.error('[layout] indexer status query failed:', error);
				return null;
			});
		const timeout = new Promise<null>((resolve) => {
			timer = setTimeout(resolve, QUERY_TIMEOUT_MS, null);
		});
		const rows = (await Promise.race([query, timeout]))?.results ?? [];

		if (rows.length === 0) {
			return { indexerStatus: null };
		}

		let syncedLedger = 0;
		let lastAdvancedAt: number | null = null;

		for (const r of rows) {
			if (r.last_ledger > syncedLedger) {
				syncedLedger = r.last_ledger;
			}
			// last_advanced_at is null until the indexer first advances — fall back to updated_at.
			const ts = new Date(r.last_advanced_at || r.updated_at).getTime();
			if (!Number.isNaN(ts) && (lastAdvancedAt === null || ts < lastAdvancedAt)) {
				// Track the laggard (minimum) across all contracts.
				lastAdvancedAt = ts;
			}
		}

		const stale = lastAdvancedAt === null || Date.now() - lastAdvancedAt > STALE_THRESHOLD_MS;

		return {
			indexerStatus: {
				syncedLedger,
				lastAdvancedAt: lastAdvancedAt === null ? null : new Date(lastAdvancedAt).toISOString(),
				stale
			}
		};
	} catch {
		return { indexerStatus: null };
	} finally {
		clearTimeout(timer);
	}
};
