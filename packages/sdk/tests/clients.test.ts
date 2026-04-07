import { describe, expect, it } from 'vitest';
import { createClients } from '../src/core/clients.js';
import { TESTNET_CONFIG, MAINNET_CONFIG } from '../src/core/config.js';

describe('createClients', () => {
	const mockSigner = {
		publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
		signTransaction: async () => ({ signedTxXdr: '', signerAddress: '' }),
		signAuthEntry: async () => ({ signedAuthEntry: '' }),
	};

	it('creates identity, reputation, and validation clients for testnet', () => {
		const clients = createClients(TESTNET_CONFIG, mockSigner);

		expect(clients.identity).toBeDefined();
		expect(clients.reputation).toBeDefined();
		expect(clients.validation).toBeDefined();
	});

	it('creates clients for mainnet', () => {
		const clients = createClients(MAINNET_CONFIG, mockSigner);

		expect(clients.identity).toBeDefined();
		expect(clients.reputation).toBeDefined();
		expect(clients.validation).toBeDefined();
	});

	it('works without signAuthEntry', () => {
		const signerNoAuth = {
			publicKey: mockSigner.publicKey,
			signTransaction: mockSigner.signTransaction,
		};

		const clients = createClients(TESTNET_CONFIG, signerNoAuth);

		expect(clients.identity).toBeDefined();
	});
});
