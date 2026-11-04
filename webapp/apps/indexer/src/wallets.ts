import type { Db } from '@stellar8004/d1';
import { IdentityClient } from '@trionlabs/stellar8004/bindings';
import { MAINNET_CONFIG } from '../../../packages/indexer/src/sdk-config.js';
import { pgTime } from './db.js';

/** The identity contract client for reads; simulation needs no account or signer. */
export function identityClient(rpcUrl: string): IdentityClient {
	return new IdentityClient({
		contractId: MAINNET_CONFIG.contracts.identity,
		networkPassphrase: MAINNET_CONFIG.networkPassphrase,
		rpcUrl
	});
}

/**
 * Sets agents.wallet from contract state (a simulated get_agent_wallet per agent). Run once after
 * the Supabase copy: the old indexer applied each registration's agentWallet event before the
 * agent's row existed, so every copied wallet is NULL. Returns the number of agents updated.
 */
export async function syncWallets(
	db: Db,
	identity: Pick<IdentityClient, 'get_agent_wallet'>,
	agentIds: readonly number[],
	now = new Date()
): Promise<number> {
	const statements = [];
	for (const id of agentIds) {
		const { result } = await identity.get_agent_wallet({ agent_id: id });
		statements.push(
			db
				.prepare('UPDATE agents SET wallet = ?, updated_at = ? WHERE id = ?')
				.bind(result ?? null, pgTime(now), id)
		);
	}
	let updated = 0;
	for (let offset = 0; offset < statements.length; offset += 100) {
		const results = await db.batch(statements.slice(offset, offset + 100));
		updated += results.reduce((sum, r) => sum + (r.meta.changes ?? 0), 0);
	}
	return updated;
}
