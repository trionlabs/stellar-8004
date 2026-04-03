import * as StellarSdk from '@stellar/stellar-sdk';
import {
	PUBLIC_IDENTITY_REGISTRY,
	PUBLIC_REPUTATION_REGISTRY,
	PUBLIC_STELLAR_NETWORK,
	PUBLIC_STELLAR_RPC_URL,
	PUBLIC_VALIDATION_REGISTRY
} from '$env/static/public';

export const stellarConfig = {
	network: PUBLIC_STELLAR_NETWORK as 'testnet' | 'mainnet',
	rpcUrl: PUBLIC_STELLAR_RPC_URL,
	networkPassphrase:
		PUBLIC_STELLAR_NETWORK === 'mainnet'
			? StellarSdk.Networks.PUBLIC
			: StellarSdk.Networks.TESTNET,
	contracts: {
		identity: PUBLIC_IDENTITY_REGISTRY,
		reputation: PUBLIC_REPUTATION_REGISTRY,
		validation: PUBLIC_VALIDATION_REGISTRY
	}
};

export const rpc = new StellarSdk.rpc.Server(stellarConfig.rpcUrl);
