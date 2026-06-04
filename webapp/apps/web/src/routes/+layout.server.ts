import { createServerSupabase } from '$lib/supabase-server.js';
import type { LayoutServerLoad } from './$types';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export const load: LayoutServerLoad = async () => {
	// G3: expose the mirror's own freshness so users can distinguish a
	// stale/lagging indexer from a censored one. Never break the layout —
	// any error here degrades to indexerStatus: null.
	try {
		const db = createServerSupabase();
		const { data: rows, error } = await db.from('indexer_state').select('*');

		if (error || !rows || rows.length === 0) {
			return { indexerStatus: null };
		}

		let syncedLedger = 0;
		let lastAdvancedAt: number | null = null;

		for (const row of rows) {
			const r = row as Record<string, unknown>;
			if (typeof r.last_ledger === 'number' && r.last_ledger > syncedLedger) {
				syncedLedger = r.last_ledger;
			}
			// last_advanced_at may not exist / be null on older rows — fall back to updated_at.
			const advancedRaw =
				(typeof r.last_advanced_at === 'string' && r.last_advanced_at) ||
				(typeof r.updated_at === 'string' && r.updated_at) ||
				null;
			if (advancedRaw) {
				const ts = new Date(advancedRaw).getTime();
				if (!Number.isNaN(ts) && (lastAdvancedAt === null || ts < lastAdvancedAt)) {
					// Track the laggard (minimum) across all contracts.
					lastAdvancedAt = ts;
				}
			}
		}

		const stale =
			lastAdvancedAt === null || Date.now() - lastAdvancedAt > STALE_THRESHOLD_MS;

		return {
			indexerStatus: {
				syncedLedger,
				lastAdvancedAt: lastAdvancedAt === null ? null : new Date(lastAdvancedAt).toISOString(),
				stale
			}
		};
	} catch {
		return { indexerStatus: null };
	}
};
