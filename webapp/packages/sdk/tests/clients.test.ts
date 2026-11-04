import { describe, expect, it } from 'vitest';
import { IdentityError } from '../src/bindings/identity.js';
import { ReputationError } from '../src/bindings/reputation.js';
import { ValidationError } from '../src/bindings/validation.js';
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

	it('uses the v2 contract interface', () => {
		const { identity } = createClients(TESTNET_CONFIG, mockSigner);
		const [output] = identity.spec.getFunc('register_full').outputs;
		expect(JSON.parse(JSON.stringify(output))).toEqual({
			result: { ok_type: 'u32', error_type: { udt: { name: 'IdentityError' } } },
		});
		expect(IdentityError[12].message).toBe('RenounceDisabled');
		expect(ReputationError[13].message).toBe('RenounceDisabled');
		expect(ValidationError[12].message).toBe('ValidatorNotIndependent');
		expect(ValidationError[13].message).toBe('RenounceDisabled');
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
				'extend_ttl', 'propose_upgrade', 'cancel_upgrade', 'execute_upgrade', 'pending_upgrade', 'version',
				'find_owner', 'agent_exists', 'is_authorized_or_owner', 'total_agents',
				'get_owner', 'transfer_ownership', 'accept_ownership', 'renounce_ownership',
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
				'get_identity_registry', 'extend_ttl',
				'propose_upgrade', 'cancel_upgrade', 'execute_upgrade', 'pending_upgrade', 'version',
				'get_owner', 'transfer_ownership', 'accept_ownership', 'renounce_ownership',
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
				'get_validation_status', 'request_exists', 'get_summary', 'index_answered',
				'get_agent_validations_paginated', 'get_validator_requests_paginated',
				'get_identity_registry', 'extend_ttl',
				'propose_upgrade', 'cancel_upgrade', 'execute_upgrade', 'pending_upgrade', 'version',
				'get_owner', 'transfer_ownership', 'accept_ownership', 'renounce_ownership',
			];
			for (const method of expectedMethods) {
				expect(typeof (validation as any)[method]).toBe('function');
			}
		});
	});
});
