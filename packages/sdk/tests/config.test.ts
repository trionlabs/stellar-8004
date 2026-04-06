import { describe, expect, it } from 'vitest';
import { TESTNET_CONFIG, MAINNET_CONFIG, getConfig } from '../src/core/config.js';

describe('TESTNET_CONFIG', () => {
	it('exposes the pinned testnet deployment config', () => {
		expect(TESTNET_CONFIG).toMatchObject({
			network: 'testnet',
			rpcUrl: 'https://soroban-testnet.stellar.org',
			deployVersion: '2026-04-06',
			contracts: {
				identity: 'CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ',
				reputation: 'CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4',
				validation: 'CA6GIV7QB4B3O5SBZZRL3E3XMFFECGRETSN4JXAYTFKF5HUTD4JY2SJQ'
			}
		});
	});

	it('supports spread-and-override config construction', () => {
		const overridden = {
			...TESTNET_CONFIG,
			contracts: {
				...TESTNET_CONFIG.contracts,
				identity: 'CNEWIDENTITYCONTRACT'
			}
		};

		expect(overridden.contracts.identity).toBe('CNEWIDENTITYCONTRACT');
		expect(overridden.contracts.reputation).toBe(TESTNET_CONFIG.contracts.reputation);
	});
});

describe('MAINNET_CONFIG', () => {
	it('exposes the pinned mainnet deployment config', () => {
		expect(MAINNET_CONFIG).toMatchObject({
			network: 'mainnet',
			rpcUrl: 'https://mainnet.sorobanrpc.com',
			deployVersion: '2026-04-07',
			contracts: {
				identity: 'CCSMX3YEKU7IZCZSLORUCX6MQEOV6WXWAGTOJZG5YITEBAEH2Q5JY4XE',
				reputation: 'CCIZJXEVL2DJXH772F7SX262M5SF7JNOIAROW2M7I6VTPOVCJ7KKM5HT',
				validation: 'CAI3ZKBNXC52F2DCEX2XQLXUTRAQKCPWUUXDELW5SPAF4GAW4HCQ4JT3'
			}
		});
	});

	it('uses public network passphrase', () => {
		expect(MAINNET_CONFIG.networkPassphrase).toBe(
			'Public Global Stellar Network ; September 2015'
		);
	});

	it('has different contracts than testnet', () => {
		expect(MAINNET_CONFIG.contracts.identity).not.toBe(TESTNET_CONFIG.contracts.identity);
		expect(MAINNET_CONFIG.contracts.reputation).not.toBe(TESTNET_CONFIG.contracts.reputation);
		expect(MAINNET_CONFIG.contracts.validation).not.toBe(TESTNET_CONFIG.contracts.validation);
	});
});

describe('getConfig', () => {
	it('returns testnet config for "testnet"', () => {
		expect(getConfig('testnet')).toEqual(TESTNET_CONFIG);
	});

	it('returns mainnet config for "mainnet"', () => {
		expect(getConfig('mainnet')).toEqual(MAINNET_CONFIG);
	});

	it('defaults to testnet when no argument', () => {
		expect(getConfig()).toEqual(TESTNET_CONFIG);
	});

	it('throws for unknown network', () => {
		// @ts-expect-error testing invalid input
		expect(() => getConfig('devnet')).toThrow('Unknown network');
	});
});
