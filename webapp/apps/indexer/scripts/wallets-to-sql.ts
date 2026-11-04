/**
 * Prints SQL that sets agents.wallet from contract state. The Supabase copy has every wallet
 * NULL: the old indexer applied each registration's agentWallet event before the agent's row
 * existed. Read-only: each wallet is a simulated get_agent_wallet call; nothing is signed.
 *
 *   node scripts/wallets-to-sql.ts <mainnet RPC URL> <agent ids: 0-73 or 1,5,9> > wallets.sql
 *   wrangler d1 execute stellar8004 --remote --file wallets.sql
 */
import { pathToFileURL } from 'node:url';
import { identityClient, readWallets, walletSql } from '../src/wallets.ts';

/** '0-2,7' -> [0, 1, 2, 7] */
export function parseIds(spec: string): number[] {
	return spec.split(',').flatMap((part) => {
		const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
		const first = Number(match?.[1]);
		const last = Number(match?.[2] ?? match?.[1]);
		if (!match || last < first) throw new Error(`Invalid agent ids: ${part}`);
		return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const [rpcUrl, ids] = process.argv.slice(2);
	if (!rpcUrl || !ids) {
		throw new Error(
			'usage: node scripts/wallets-to-sql.ts <mainnet RPC URL> <agent ids, e.g. 0-73 or 1,5,9>'
		);
	}
	process.stdout.write(walletSql(await readWallets(identityClient(rpcUrl), parseIds(ids))));
}
