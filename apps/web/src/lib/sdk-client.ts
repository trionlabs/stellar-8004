import { env } from '$env/dynamic/public';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
	SorobanClient,
	TESTNET_CONFIG,
	type StellarConfig
} from '@trionlabs/8004s-sdk';
import { FreighterSigner } from '@trionlabs/8004s-sdk/signers/freighter';

export function buildConfig(): StellarConfig {
	const network = env.PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
	const baseConfig =
		network === 'testnet'
			? TESTNET_CONFIG
			: {
					network: 'mainnet' as const,
					rpcUrl: env.PUBLIC_STELLAR_RPC_URL,
					networkPassphrase: StellarSdk.Networks.PUBLIC,
					contracts: {
						identity: env.PUBLIC_IDENTITY_REGISTRY,
						reputation: env.PUBLIC_REPUTATION_REGISTRY,
						validation: env.PUBLIC_VALIDATION_REGISTRY
					}
				};

	return {
		...baseConfig,
		rpcUrl: env.PUBLIC_STELLAR_RPC_URL || baseConfig.rpcUrl,
		networkPassphrase:
			network === 'mainnet'
				? StellarSdk.Networks.PUBLIC
				: StellarSdk.Networks.TESTNET,
		contracts: {
			identity: env.PUBLIC_IDENTITY_REGISTRY || baseConfig.contracts.identity,
			reputation: env.PUBLIC_REPUTATION_REGISTRY || baseConfig.contracts.reputation,
			validation: env.PUBLIC_VALIDATION_REGISTRY || baseConfig.contracts.validation
		}
	};
}

export const stellarConfig = buildConfig();
export const signer = new FreighterSigner();
export const client = new SorobanClient(signer, stellarConfig);
