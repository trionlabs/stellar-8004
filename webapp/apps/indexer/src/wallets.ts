// `.ts` specifiers: scripts/wallets-to-sql.ts runs this file under plain node (type stripping).
import { StrKey } from '@stellar/stellar-sdk';
import { IdentityClient } from '@trionlabs/stellar8004/bindings';
import { MAINNET_CONFIG } from './chain/sdk-config.ts';

/** The identity contract client for reads; simulation needs no account or signer. */
export function identityClient(rpcUrl: string): IdentityClient {
	return new IdentityClient({
		contractId: MAINNET_CONFIG.contracts.identity,
		networkPassphrase: MAINNET_CONFIG.networkPassphrase,
		rpcUrl
	});
}

export interface AgentWallet {
	id: number;
	wallet: string | null;
}

/** Each agent's wallet from contract state (a simulated get_agent_wallet call), null when unset. */
export async function readWallets(
	identity: Pick<IdentityClient, 'get_agent_wallet'>,
	agentIds: readonly number[]
): Promise<AgentWallet[]> {
	const wallets: AgentWallet[] = [];
	for (const id of agentIds) {
		const { result } = await identity.get_agent_wallet({ agent_id: id });
		wallets.push({ id, wallet: result ?? null });
	}
	return wallets;
}

/** One UPDATE per agent, NULL where the contract holds no wallet. updated_at is left alone. */
export function walletSql(wallets: readonly AgentWallet[]): string {
	return wallets
		.map(({ id, wallet }) => {
			if (!Number.isSafeInteger(id) || id < 0) throw new Error(`Invalid agent id: ${id}`);
			const address =
				wallet !== null &&
				(StrKey.isValidEd25519PublicKey(wallet) ||
					StrKey.isValidContract(wallet) ||
					StrKey.isValidMed25519PublicKey(wallet));
			if (wallet !== null && !address)
				throw new Error(`Unexpected wallet for agent ${id}: ${wallet}`);
			return `UPDATE agents SET wallet = ${wallet === null ? 'NULL' : `'${wallet}'`} WHERE id = ${id};\n`;
		})
		.join('');
}
