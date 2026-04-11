import * as StellarSdk from '@stellar/stellar-sdk';

export interface StellarConfig {
	network: 'testnet' | 'mainnet';
	rpcUrl: string;
	networkPassphrase: string;
	contracts: {
		identity: string;
		reputation: string;
		validation: string;
	};
	/** Date stamp of the deployment that produced these addresses. */
	deployVersion?: string;
	/**
	 * Ledger sequence at which the contracts in this config were deployed.
	 * Used by indexer cold-start and the backfill script to bound the event
	 * scan range. Override via env var in production - the constant baked in
	 * here is best-effort and may go stale after each redeploy.
	 */
	deployLedger?: number;
}

export const TESTNET_CONFIG: StellarConfig = {
	network: 'testnet',
	rpcUrl: 'https://soroban-testnet.stellar.org',
	networkPassphrase: StellarSdk.Networks.TESTNET,
	contracts: {
		identity: 'CA4GKPENYABUM7POQFCN3RDXIDVISC7T5QKHW5BDCJWOFDBW7P5ZCSUG',
		reputation: 'CDKDYYL2PU3HKTCWFCHVAALZGABLFZ4F6MIEE45JKE44VH6VH2D3DHMT',
		validation: 'CD3YFHYEI2JGTBKZTRT7QOMM337POX2G7CPVDBRK6DFDOEFZIQFAOCHD'
	},
	deployVersion: '2026-04-11',
	deployLedger: 1973000
};

// Mainnet TBD - will deploy after testnet validation.
export const MAINNET_CONFIG: StellarConfig = {
	network: 'mainnet',
	rpcUrl: 'https://mainnet.sorobanrpc.com',
	networkPassphrase: StellarSdk.Networks.PUBLIC,
	contracts: {
		identity: '',
		reputation: '',
		validation: ''
	},
};

export function getConfig(network: 'testnet' | 'mainnet' = 'testnet'): StellarConfig {
	switch (network) {
		case 'testnet':
			return TESTNET_CONFIG;
		case 'mainnet':
			return MAINNET_CONFIG;
		default:
			throw new Error(`Unknown network: ${network}`);
	}
}
