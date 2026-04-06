import { describe, expect, it } from 'vitest';
import { TESTNET_CONFIG } from '../src/core/config.js';

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
