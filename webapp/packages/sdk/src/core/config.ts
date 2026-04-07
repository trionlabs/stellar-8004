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
		identity: 'CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ',
		reputation: 'CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4',
		validation: 'CA6GIV7QB4B3O5SBZZRL3E3XMFFECGRETSN4JXAYTFKF5HUTD4JY2SJQ'
	},
	deployVersion: '2026-04-06',
	deployLedger: 1819978
};

export const MAINNET_CONFIG: StellarConfig = {
	network: 'mainnet',
	rpcUrl: 'https://mainnet.sorobanrpc.com',
	networkPassphrase: StellarSdk.Networks.PUBLIC,
	contracts: {
		identity: 'CCSMX3YEKU7IZCZSLORUCX6MQEOV6WXWAGTOJZG5YITEBAEH2Q5JY4XE',
		reputation: 'CCIZJXEVL2DJXH772F7SX262M5SF7JNOIAROW2M7I6VTPOVCJ7KKM5HT',
		validation: 'CAI3ZKBNXC52F2DCEX2XQLXUTRAQKCPWUUXDELW5SPAF4GAW4HCQ4JT3'
	},
	deployVersion: '2026-04-07',
	deployLedger: 62001391
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
