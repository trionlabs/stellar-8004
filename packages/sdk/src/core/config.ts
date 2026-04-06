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
	deployVersion?: string;
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
	deployVersion: '2026-04-06'
};
