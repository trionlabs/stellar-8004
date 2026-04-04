import * as StellarSdk from '@stellar/stellar-sdk';
import { env } from '$env/dynamic/public';

export function getStellarConfig() {
	return {
		network: env.PUBLIC_STELLAR_NETWORK as 'testnet' | 'mainnet',
		rpcUrl: env.PUBLIC_STELLAR_RPC_URL,
		networkPassphrase:
			env.PUBLIC_STELLAR_NETWORK === 'mainnet'
				? StellarSdk.Networks.PUBLIC
				: StellarSdk.Networks.TESTNET,
		contracts: {
			identity: env.PUBLIC_IDENTITY_REGISTRY,
			reputation: env.PUBLIC_REPUTATION_REGISTRY,
			validation: env.PUBLIC_VALIDATION_REGISTRY
		}
	};
}

export function getRpc() {
	return new StellarSdk.rpc.Server(env.PUBLIC_STELLAR_RPC_URL);
}
