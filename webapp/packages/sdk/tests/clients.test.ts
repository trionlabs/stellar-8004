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

	describe('identity client methods', () => {
		it('exposes all expected contract methods', () => {
			const { identity } = createClients(TESTNET_CONFIG, mockSigner);
			const expectedMethods = [
				'register', 'register_with_uri', 'register_full',
				'set_agent_uri', 'agent_uri',
				'set_metadata', 'get_metadata',
				'set_agent_wallet', 'get_agent_wallet', 'unset_agent_wallet',
				'extend_ttl', 'upgrade', 'version',
				'balance', 'owner_of', 'transfer', 'transfer_from',
				'approve', 'approve_for_all', 'get_approved', 'is_approved_for_all',
				'name', 'symbol', 'token_uri',
			];
			for (const method of expectedMethods) {
				expect(typeof (identity as any)[method]).toBe('function');
			}
		});
	});

	describe('reputation client methods', () => {
		it('exposes all expected contract methods', () => {
			const { reputation } = createClients(TESTNET_CONFIG, mockSigner);
			const expectedMethods = [
				'give_feedback', 'revoke_feedback', 'append_response',
				'read_feedback', 'get_summary',
				'get_clients_paginated', 'get_last_index', 'get_response_count',
				'get_identity_registry', 'extend_ttl', 'upgrade', 'version',
			];
			for (const method of expectedMethods) {
				expect(typeof (reputation as any)[method]).toBe('function');
			}
		});
	});

	describe('validation client methods', () => {
		it('exposes all expected contract methods', () => {
			const { validation } = createClients(TESTNET_CONFIG, mockSigner);
			const expectedMethods = [
				'validation_request', 'validation_response',
				'get_validation_status', 'get_summary',
				'get_agent_validations_paginated', 'get_validator_requests_paginated',
				'get_identity_registry', 'extend_ttl', 'upgrade', 'version',
			];
			for (const method of expectedMethods) {
				expect(typeof (validation as any)[method]).toBe('function');
			}
		});
	});
});
