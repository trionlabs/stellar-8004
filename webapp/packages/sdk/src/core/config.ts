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
		identity: 'CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH',
		reputation: 'CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55',
		validation: 'CC5USZRO26MOIAVNYTTJDS63C2OBBLREOAOET4CPF2EZWO3YFKLMO3SL'
	},
	deployVersion: '2026-04-11',
	deployLedger: 1980692
};

export const MAINNET_CONFIG: StellarConfig = {
	network: 'mainnet',
	rpcUrl: 'https://mainnet.sorobanrpc.com',
	networkPassphrase: StellarSdk.Networks.PUBLIC,
	contracts: {
		identity: 'CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35',
		reputation: 'CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA',
		validation: 'CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG'
	},
	deployVersion: '2026-04-11',
	deployLedger: 62071546
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
