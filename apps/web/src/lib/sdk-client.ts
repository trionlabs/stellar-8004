import { env } from '$env/dynamic/public';
import {
	SorobanClient,
	getConfig,
	type StellarConfig
} from '@trionlabs/8004s-sdk';
import { FreighterSigner } from '@trionlabs/8004s-sdk/signers/freighter';

const network = env.PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const baseConfig = getConfig(network);

export const stellarConfig: StellarConfig = {
	...baseConfig,
	rpcUrl: env.PUBLIC_STELLAR_RPC_URL || baseConfig.rpcUrl,
	contracts: {
		identity: env.PUBLIC_IDENTITY_REGISTRY || baseConfig.contracts.identity,
		reputation: env.PUBLIC_REPUTATION_REGISTRY || baseConfig.contracts.reputation,
		validation: env.PUBLIC_VALIDATION_REGISTRY || baseConfig.contracts.validation
	}
};

export const signer = new FreighterSigner();
export const client = new SorobanClient(signer, stellarConfig);
