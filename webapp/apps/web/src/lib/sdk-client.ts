import { env } from '$env/dynamic/public';
import {
	createClients,
	getConfig,
	type StellarConfig,
} from '@trionlabs/stellar8004';
import { FreighterSigner } from '@trionlabs/stellar8004/signers/freighter';

const network = env.PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const baseConfig = getConfig(network);

export const stellarConfig: StellarConfig = {
	...baseConfig,
	rpcUrl: env.PUBLIC_STELLAR_RPC_URL || baseConfig.rpcUrl,
	contracts: {
		identity: env.PUBLIC_IDENTITY_REGISTRY || baseConfig.contracts.identity,
		reputation: env.PUBLIC_REPUTATION_REGISTRY || baseConfig.contracts.reputation,
		validation: env.PUBLIC_VALIDATION_REGISTRY || baseConfig.contracts.validation,
	},
};

export const signer = new FreighterSigner();

export function getClients() {
	if (!signer.publicKey) {
		throw new Error('Wallet not connected. Call signer.connect() first.');
	}
	return createClients(stellarConfig, signer);
}
