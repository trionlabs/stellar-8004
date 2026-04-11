import { describe, expect, it } from 'vitest';
import { TESTNET_CONFIG, MAINNET_CONFIG, getConfig } from '../src/core/config.js';

describe('TESTNET_CONFIG', () => {
	it('exposes the pinned testnet deployment config', () => {
		expect(TESTNET_CONFIG).toMatchObject({
			network: 'testnet',
			rpcUrl: 'https://soroban-testnet.stellar.org',
			deployVersion: '2026-04-11',
			contracts: {
				identity: 'CA4GKPENYABUM7POQFCN3RDXIDVISC7T5QKHW5BDCJWOFDBW7P5ZCSUG',
				reputation: 'CDKDYYL2PU3HKTCWFCHVAALZGABLFZ4F6MIEE45JKE44VH6VH2D3DHMT',
				validation: 'CD3YFHYEI2JGTBKZTRT7QOMM337POX2G7CPVDBRK6DFDOEFZIQFAOCHD'
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
	it('exposes mainnet config with TBD contracts', () => {
		expect(MAINNET_CONFIG).toMatchObject({
			network: 'mainnet',
			rpcUrl: 'https://mainnet.sorobanrpc.com',
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
