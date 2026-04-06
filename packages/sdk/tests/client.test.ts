import * as StellarSdk from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SorobanClient } from '../src/core/client.js';
import type { StellarConfig } from '../src/core/config.js';
import type { WalletSigner } from '../src/signers/interface.js';

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_CONFIG: StellarConfig = {
	network: 'testnet',
	rpcUrl: 'https://soroban-testnet.stellar.org',
	networkPassphrase: StellarSdk.Networks.TESTNET,
	contracts: {
		identity: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
		reputation: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
		validation: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM'
	}
};

const keypair = StellarSdk.Keypair.random();

function createMockSigner(overrides: Partial<WalletSigner> = {}): WalletSigner {
	return {
		publicKey: keypair.publicKey(),
		// Sign the transaction for real so fromXDR can parse the result
		signTransaction: vi.fn().mockImplementation(async (xdr: string) => {
			const tx = StellarSdk.TransactionBuilder.fromXDR(
				xdr,
				StellarSdk.Networks.TESTNET
			) as StellarSdk.Transaction;
			tx.sign(keypair);
			return {
				signedTxXdr: tx.toXDR(),
				signerAddress: keypair.publicKey()
			};
		}),
		signAuthEntry: vi.fn().mockResolvedValue({
			signedAuthEntry: 'mock-signed-auth',
			signerAddress: keypair.publicKey()
		}),
		...overrides
	};
}

// Minimal simulation success response that satisfies the SDK's checks
function createSimulationSuccess(latestLedger = 1000) {
	return {
		id: '1',
		latestLedger,
		events: [],
		_parsed: true,
		result: {
			auth: [],
			retval: StellarSdk.nativeToScVal(42, { type: 'u32' })
		},
		transactionData: new StellarSdk.SorobanDataBuilder(),
		minResourceFee: '100',
		cost: { cpuInsns: '0', memBytes: '0' }
	};
}

// ─�� Tests ────────────────────────────────────────────────────────────

describe('SorobanClient', () => {
	let mockSigner: WalletSigner;
	let client: SorobanClient;

	beforeEach(() => {
		mockSigner = createMockSigner();
		client = new SorobanClient(mockSigner, TEST_CONFIG);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('constructor', () => {
		it('creates an RPC server from config', () => {
			expect(client.rpc).toBeInstanceOf(StellarSdk.rpc.Server);
		});
	});

	describe('registerAgent', () => {
		it('validates URI before calling contract', async () => {
			await expect(
				client.registerAgent('ftp://bad-scheme')
			).rejects.toThrow('Agent URI must use https://');
		});

		it('rejects oversized URIs', async () => {
			const oversized = `https://x.com/${'a'.repeat(9000)}`;
			await expect(client.registerAgent(oversized)).rejects.toThrow(
				'Agent URI too large'
			);
		});

		it('calls register_with_uri when agentUri is provided', async () => {
			const sim = createSimulationSuccess();

			vi.spyOn(client.rpc, 'getAccount').mockResolvedValue(
				new StellarSdk.Account(keypair.publicKey(), '0')
			);
			vi.spyOn(client.rpc, 'simulateTransaction').mockResolvedValue(
				sim as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse
			);
			vi.spyOn(client.rpc, 'sendTransaction').mockResolvedValue({
				status: 'PENDING',
				hash: 'abc123'
			} as unknown as StellarSdk.rpc.Api.SendTransactionResponse);
			vi.spyOn(client.rpc, 'getTransaction').mockResolvedValue({
				status: StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS,
				returnValue: StellarSdk.nativeToScVal(7, { type: 'u32' })
			} as unknown as StellarSdk.rpc.Api.GetTransactionResponse);

			const result = await client.registerAgent('https://example.com/agent.json');

			expect(result).toEqual({ agentId: 7, hash: 'abc123' });
			expect(mockSigner.signTransaction).toHaveBeenCalledTimes(1);
		});

		it('calls register (no URI) when agentUri is omitted', async () => {
			const sim = createSimulationSuccess();

			vi.spyOn(client.rpc, 'getAccount').mockResolvedValue(
				new StellarSdk.Account(keypair.publicKey(), '0')
			);
			vi.spyOn(client.rpc, 'simulateTransaction').mockResolvedValue(
				sim as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse
			);
			vi.spyOn(client.rpc, 'sendTransaction').mockResolvedValue({
				status: 'PENDING',
				hash: 'def456'
			} as unknown as StellarSdk.rpc.Api.SendTransactionResponse);
			vi.spyOn(client.rpc, 'getTransaction').mockResolvedValue({
				status: StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS,
				returnValue: StellarSdk.nativeToScVal(1, { type: 'u32' })
			} as unknown as StellarSdk.rpc.Api.GetTransactionResponse);

			const result = await client.registerAgent();

			expect(result).toEqual({ agentId: 1, hash: 'def456' });
		});
	});

	describe('unfunded account detection', () => {
		it('throws a descriptive error when getAccount returns 404', async () => {
			const notFoundError = Object.assign(new Error('Not found'), {
				status: 404
			});
			vi.spyOn(client.rpc, 'getAccount').mockRejectedValue(notFoundError);

			await expect(client.registerAgent()).rejects.toThrow(
				/Account not found on testnet.*fundTestnet/
			);
		});

		it('throws a descriptive error when getAccount response includes 404', async () => {
			const notFoundError = Object.assign(new Error('Not found'), {
				response: { status: 404 }
			});
			vi.spyOn(client.rpc, 'getAccount').mockRejectedValue(notFoundError);

			await expect(client.registerAgent()).rejects.toThrow(
				/Account not found on testnet/
			);
		});

		it('rethrows non-404 errors', async () => {
			vi.spyOn(client.rpc, 'getAccount').mockRejectedValue(
				new Error('Network timeout')
			);

			await expect(client.registerAgent()).rejects.toThrow('Network timeout');
		});
	});

	describe('TRY_AGAIN_LATER retry', () => {
		it('retries up to 3 times then throws', async () => {
			const sim = createSimulationSuccess();

			vi.spyOn(client.rpc, 'getAccount').mockResolvedValue(
				new StellarSdk.Account(keypair.publicKey(), '0')
			);
			vi.spyOn(client.rpc, 'simulateTransaction').mockResolvedValue(
				sim as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse
			);

			const sendSpy = vi.spyOn(client.rpc, 'sendTransaction').mockResolvedValue({
				status: 'TRY_AGAIN_LATER',
				hash: 'retry-hash'
			} as unknown as StellarSdk.rpc.Api.SendTransactionResponse);

			await expect(client.registerAgent('https://example.com')).rejects.toThrow(
				/not accepted after 3 retries/
			);

			// Initial attempt + 3 retries = 4 calls
			expect(sendSpy).toHaveBeenCalledTimes(4);
		});

		it('succeeds after a TRY_AGAIN_LATER followed by PENDING', async () => {
			const sim = createSimulationSuccess();

			vi.spyOn(client.rpc, 'getAccount').mockResolvedValue(
				new StellarSdk.Account(keypair.publicKey(), '0')
			);
			vi.spyOn(client.rpc, 'simulateTransaction').mockResolvedValue(
				sim as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse
			);

			vi.spyOn(client.rpc, 'sendTransaction')
				.mockResolvedValueOnce({
					status: 'TRY_AGAIN_LATER',
					hash: 'try1'
				} as unknown as StellarSdk.rpc.Api.SendTransactionResponse)
				.mockResolvedValueOnce({
					status: 'PENDING',
					hash: 'ok-hash'
				} as unknown as StellarSdk.rpc.Api.SendTransactionResponse);

			vi.spyOn(client.rpc, 'getTransaction').mockResolvedValue({
				status: StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS,
				returnValue: StellarSdk.nativeToScVal(99, { type: 'u32' })
			} as unknown as StellarSdk.rpc.Api.GetTransactionResponse);

			const result = await client.registerAgent('https://example.com');

			expect(result).toEqual({ agentId: 99, hash: 'ok-hash' });
		});
	});

	describe('simulation error', () => {
		it('throws when simulation fails', async () => {
			vi.spyOn(client.rpc, 'getAccount').mockResolvedValue(
				new StellarSdk.Account(keypair.publicKey(), '0')
			);
			vi.spyOn(client.rpc, 'simulateTransaction').mockResolvedValue({
				id: '1',
				latestLedger: 1000,
				events: [],
				error: 'HostError: something went wrong',
				_parsed: true
			} as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse);

			await expect(client.registerAgent('https://example.com')).rejects.toThrow(
				'Simulation failed: HostError: something went wrong'
			);
		});
	});

	describe('transaction send errors', () => {
		it('throws on ERROR status', async () => {
			const sim = createSimulationSuccess();

			vi.spyOn(client.rpc, 'getAccount').mockResolvedValue(
				new StellarSdk.Account(keypair.publicKey(), '0')
			);
			vi.spyOn(client.rpc, 'simulateTransaction').mockResolvedValue(
				sim as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse
			);
			vi.spyOn(client.rpc, 'sendTransaction').mockResolvedValue({
				status: 'ERROR',
				hash: 'err-hash',
				errorResult: { extras: 'tx_bad_auth' }
			} as unknown as StellarSdk.rpc.Api.SendTransactionResponse);

			await expect(client.registerAgent('https://example.com')).rejects.toThrow(
				'Transaction send failed'
			);
		});
	});

	describe('transaction confirmation', () => {
		it('throws on FAILED transaction', async () => {
			const sim = createSimulationSuccess();

			vi.spyOn(client.rpc, 'getAccount').mockResolvedValue(
				new StellarSdk.Account(keypair.publicKey(), '0')
			);
			vi.spyOn(client.rpc, 'simulateTransaction').mockResolvedValue(
				sim as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse
			);
			vi.spyOn(client.rpc, 'sendTransaction').mockResolvedValue({
				status: 'PENDING',
				hash: 'fail-hash'
			} as unknown as StellarSdk.rpc.Api.SendTransactionResponse);
			vi.spyOn(client.rpc, 'getTransaction').mockResolvedValue({
				status: StellarSdk.rpc.Api.GetTransactionStatus.FAILED
			} as unknown as StellarSdk.rpc.Api.GetTransactionResponse);

			await expect(client.registerAgent('https://example.com')).rejects.toThrow(
				'Transaction failed on-chain'
			);
		});
	});

	describe('signer error handling', () => {
		it('throws when signer returns an error', async () => {
			const sim = createSimulationSuccess();
			const errorSigner = createMockSigner({
				signTransaction: vi.fn().mockResolvedValue({
					signedTxXdr: '',
					error: { message: 'User rejected', code: 4001 }
				})
			});
			const errorClient = new SorobanClient(errorSigner, TEST_CONFIG);

			vi.spyOn(errorClient.rpc, 'getAccount').mockResolvedValue(
				new StellarSdk.Account(keypair.publicKey(), '0')
			);
			vi.spyOn(errorClient.rpc, 'simulateTransaction').mockResolvedValue(
				sim as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse
			);

			await expect(
				errorClient.registerAgent('https://example.com')
			).rejects.toThrow('Transaction signing failed: User rejected');
		});

		it('throws when signer returns no signed XDR', async () => {
			const sim = createSimulationSuccess();
			const emptySigner = createMockSigner({
				signTransaction: vi.fn().mockResolvedValue({
					signedTxXdr: '',
					signerAddress: keypair.publicKey()
				})
			});
			const emptyClient = new SorobanClient(emptySigner, TEST_CONFIG);

			vi.spyOn(emptyClient.rpc, 'getAccount').mockResolvedValue(
				new StellarSdk.Account(keypair.publicKey(), '0')
			);
			vi.spyOn(emptyClient.rpc, 'simulateTransaction').mockResolvedValue(
				sim as unknown as StellarSdk.rpc.Api.SimulateTransactionResponse
			);

			await expect(
				emptyClient.registerAgent('https://example.com')
			).rejects.toThrow('Signer returned no signed transaction XDR');
		});
	});

	describe('setAgentWallet', () => {
		it('validates the wallet address', async () => {
			await expect(
				client.setAgentWallet(1, 'NOT_A_VALID_ADDRESS')
			).rejects.toThrow('Invalid Stellar address');
		});
	});

	describe('updateAgentUri', () => {
		it('validates the URI', async () => {
			await expect(
				client.updateAgentUri(1, 'ftp://bad')
			).rejects.toThrow('Agent URI must use https://');
		});
	});
});
