import { describe, expect, it } from 'vitest';
import { TESTNET_CONFIG, MAINNET_CONFIG, getConfig } from '../src/core/config.js';

describe('TESTNET_CONFIG', () => {
	it('exposes the pinned testnet deployment config', () => {
		expect(TESTNET_CONFIG).toMatchObject({
			network: 'testnet',
			rpcUrl: 'https://soroban-testnet.stellar.org',
			deployVersion: '2026-04-11',
			contracts: {
				identity: 'CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH',
				reputation: 'CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55',
				validation: 'CC5USZRO26MOIAVNYTTJDS63C2OBBLREOAOET4CPF2EZWO3YFKLMO3SL'
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
			deployVersion: '2026-04-11',
			contracts: {
				identity: 'CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35',
				reputation: 'CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA',
				validation: 'CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG'
			}
		});
	});

	it('uses public network passphrase', () => {
		expect(MAINNET_CONFIG.networkPassphrase).toBe(
			'Public Global Stellar Network ; September 2015'
		);
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
