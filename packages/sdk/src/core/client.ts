import * as StellarSdk from '@stellar/stellar-sdk';
import type { StellarConfig } from './config.js';
import type {
	FeedbackParams,
	RegisterResult,
	ValidationParams
} from './types.js';
import type { WalletError, WalletSigner } from '../signers/interface.js';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;
const AUTH_ENTRY_LEDGER_BUFFER = 60;
const MAX_SEND_RETRIES = 3;
const MAX_URI_LENGTH = 8192;

export const SAFE_URI_SCHEMES = ['https://', 'http://', 'ipfs://', 'data:application/json'];

export function validateAgentUri(uri: string): void {
	if (uri.length > MAX_URI_LENGTH) {
		throw new Error(`Agent URI too large (max ${MAX_URI_LENGTH / 1024}KB)`);
	}

	if (!SAFE_URI_SCHEMES.some((scheme) => uri.startsWith(scheme))) {
		throw new Error('Agent URI must use https://, http://, ipfs://, or data: scheme');
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingAccountError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;

	const response = Reflect.get(error, 'response');
	const status =
		Reflect.get(error, 'status') ??
		(typeof response === 'object' && response !== null ? Reflect.get(response, 'status') : undefined);

	if (status === 404) return true;

	const message = error instanceof Error ? error.message : String(error);
	return message.includes('404');
}

function formatWalletError(prefix: string, error?: WalletError): string {
	if (!error) return prefix;

	const extra = error.ext?.length ? ` (${error.ext.join(', ')})` : '';
	return `${prefix}: ${error.message}${extra}`;
}

export class SorobanClient {
	readonly rpc: StellarSdk.rpc.Server;

	constructor(
		private readonly signer: WalletSigner,
		private readonly config: StellarConfig
	) {
		this.rpc = new StellarSdk.rpc.Server(config.rpcUrl);
	}

	async registerAgent(agentUri?: string): Promise<RegisterResult> {
		if (agentUri) validateAgentUri(agentUri);

		const ownerAddress = StellarSdk.nativeToScVal(this.signer.publicKey, { type: 'address' });
		const args = agentUri
			? [ownerAddress, StellarSdk.nativeToScVal(agentUri, { type: 'string' })]
			: [ownerAddress];

		const method = agentUri ? 'register_with_uri' : 'register';
		const { hash, result } = await this.buildAndSign(
			method,
			this.config.contracts.identity,
			args
		);

		return {
			agentId: result ? (StellarSdk.scValToNative(result) as number) : 0,
			hash
		};
	}

	async updateAgentUri(agentId: number, newUri: string): Promise<{ hash: string }> {
		validateAgentUri(newUri);

		const args = [
			StellarSdk.nativeToScVal(this.signer.publicKey, { type: 'address' }),
			StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
			StellarSdk.nativeToScVal(newUri, { type: 'string' })
		];

		const { hash } = await this.buildAndSign(
			'set_agent_uri',
			this.config.contracts.identity,
			args
		);

		return { hash };
	}

	async setAgentWallet(agentId: number, newWallet: string): Promise<{ hash: string }> {
		if (!StellarSdk.StrKey.isValidEd25519PublicKey(newWallet)) {
			throw new Error('Invalid Stellar address');
		}

		const args = [
			StellarSdk.nativeToScVal(this.signer.publicKey, { type: 'address' }),
			StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
			StellarSdk.nativeToScVal(newWallet, { type: 'address' })
		];

		const { hash } = await this.buildAndSign(
			'set_agent_wallet',
			this.config.contracts.identity,
			args
		);

		return { hash };
	}

	async unsetAgentWallet(agentId: number): Promise<{ hash: string }> {
		const args = [
			StellarSdk.nativeToScVal(this.signer.publicKey, { type: 'address' }),
			StellarSdk.nativeToScVal(agentId, { type: 'u32' })
		];

		const { hash } = await this.buildAndSign(
			'unset_agent_wallet',
			this.config.contracts.identity,
			args
		);

		return { hash };
	}

	async giveFeedback(params: FeedbackParams): Promise<{ hash: string }> {
		const args = [
			StellarSdk.nativeToScVal(this.signer.publicKey, { type: 'address' }),
			StellarSdk.nativeToScVal(params.agentId, { type: 'u32' }),
			StellarSdk.nativeToScVal(BigInt(params.value), { type: 'i128' }),
			StellarSdk.nativeToScVal(params.valueDecimals, { type: 'u32' }),
			StellarSdk.nativeToScVal(params.tag1, { type: 'string' }),
			StellarSdk.nativeToScVal(params.tag2, { type: 'string' }),
			StellarSdk.nativeToScVal(params.endpoint, { type: 'string' }),
			StellarSdk.nativeToScVal(params.feedbackUri, { type: 'string' }),
			StellarSdk.nativeToScVal(params.feedbackHash, { type: 'bytes' })
		];

		const { hash } = await this.buildAndSign(
			'give_feedback',
			this.config.contracts.reputation,
			args
		);

		return { hash };
	}

	async requestValidation(params: ValidationParams): Promise<{ hash: string }> {
		const encoder = new TextEncoder();
		const data = encoder.encode(
			`${params.agentId}:${params.validatorAddress}:${Date.now()}:${crypto.randomUUID()}`
		);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const requestHash = new Uint8Array(hashBuffer);

		const args = [
			StellarSdk.nativeToScVal(this.signer.publicKey, { type: 'address' }),
			StellarSdk.nativeToScVal(params.validatorAddress, { type: 'address' }),
			StellarSdk.nativeToScVal(params.agentId, { type: 'u32' }),
			StellarSdk.nativeToScVal(params.requestUri, { type: 'string' }),
			StellarSdk.nativeToScVal(requestHash, { type: 'bytes' })
		];

		const { hash } = await this.buildAndSign(
			'validation_request',
			this.config.contracts.validation,
			args
		);

		return { hash };
	}

	private async buildAndSign(
		method: string,
		contractId: string,
		args: StellarSdk.xdr.ScVal[]
	): Promise<{ hash: string; result?: StellarSdk.xdr.ScVal }> {
		const account = await this.getAccount();
		const contract = new StellarSdk.Contract(contractId);

		let tx = new StellarSdk.TransactionBuilder(account, {
			fee: StellarSdk.BASE_FEE,
			networkPassphrase: this.config.networkPassphrase
		})
			.addOperation(contract.call(method, ...args))
			.setTimeout(180)
			.build();

		const simulation = await this.rpc.simulateTransaction(tx);
		if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
			throw new Error(`Simulation failed: ${simulation.error}`);
		}

		const signatureExpirationLedger =
			simulation.latestLedger + AUTH_ENTRY_LEDGER_BUFFER;

		if (simulation.result?.auth?.length) {
			await this.signNonInvokerAuthEntries(
				simulation.result.auth,
				signatureExpirationLedger
			);

			const latestLedger = await this.rpc.getLatestLedger();
			if (latestLedger.sequence >= signatureExpirationLedger) {
				throw new Error('Auth entry expired — network was slow. Retry the transaction.');
			}
		}

		tx = StellarSdk.rpc.assembleTransaction(tx, simulation).build();

		const signed = await this.signer.signTransaction(tx.toXDR(), {
			networkPassphrase: this.config.networkPassphrase,
			address: this.signer.publicKey
		});

		if (signed.error) {
			throw new Error(formatWalletError('Transaction signing failed', signed.error));
		}

		if (!signed.signedTxXdr) {
			throw new Error('Signer returned no signed transaction XDR');
		}

		const signedTx = StellarSdk.TransactionBuilder.fromXDR(
			signed.signedTxXdr,
			this.config.networkPassphrase
		) as StellarSdk.Transaction;

		const response = await this.sendTransactionWithRetry(signedTx);
		return this.awaitTransaction(response.hash);
	}

	private async getAccount(): Promise<StellarSdk.Account> {
		try {
			return await this.rpc.getAccount(this.signer.publicKey);
		} catch (error) {
			if (isMissingAccountError(error)) {
				throw new Error(
					`Account not found on ${this.config.network}. Fund it first: await fundTestnet("${this.signer.publicKey}")`
				);
			}

			throw error;
		}
	}

	private async signNonInvokerAuthEntries(
		authEntries: StellarSdk.xdr.SorobanAuthorizationEntry[],
		signatureExpirationLedger: number
	): Promise<void> {
		for (let index = 0; index < authEntries.length; index += 1) {
			const entry = authEntries[index];
			const credentials = entry.credentials();

			if (credentials.switch().name !== 'sorobanCredentialsAddress') {
				continue;
			}

			const entryAddress = StellarSdk.Address.fromScAddress(
				credentials.address().address()
			).toString();

			if (entryAddress === this.signer.publicKey) {
				continue;
			}

			const authPreimage = this.buildAuthEntryPreimage(
				entry,
				signatureExpirationLedger
			);
			const signed = await this.signer.signAuthEntry(authPreimage, {
				networkPassphrase: this.config.networkPassphrase,
				address: entryAddress
			});

			if (signed.error) {
				throw new Error(formatWalletError('Auth entry signing failed', signed.error));
			}

			if (!signed.signedAuthEntry) {
				throw new Error('Signer returned no signed auth entry');
			}

			authEntries[index] = await this.normalizeSignedAuthEntry(
				entry,
				signed.signedAuthEntry,
				signatureExpirationLedger
			);
		}
	}

	private buildAuthEntryPreimage(
		entry: StellarSdk.xdr.SorobanAuthorizationEntry,
		signatureExpirationLedger: number
	): string {
		const credentials = entry.credentials().address();
		// TextEncoder produces a cross-platform Uint8Array (no Node Buffer needed).
		// StellarSdk.hash accepts Uint8Array at runtime; the cast satisfies the TS signature.
		const passphraseBytes = new TextEncoder().encode(this.config.networkPassphrase);
		const networkId = StellarSdk.hash(passphraseBytes as unknown as Buffer);
		const preimage = StellarSdk.xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
			new StellarSdk.xdr.HashIdPreimageSorobanAuthorization({
				networkId,
				nonce: credentials.nonce(),
				invocation: entry.rootInvocation(),
				signatureExpirationLedger
			})
		);

		return preimage.toXDR('base64');
	}

	private async normalizeSignedAuthEntry(
		entry: StellarSdk.xdr.SorobanAuthorizationEntry,
		signedAuthEntry: string,
		signatureExpirationLedger: number
	): Promise<StellarSdk.xdr.SorobanAuthorizationEntry> {
		try {
			return StellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(
				signedAuthEntry,
				'base64'
			);
		} catch {
			// Fallback: signedAuthEntry is a raw signature (not a full XDR entry).
			// Decode base64 to Uint8Array without relying on Node's Buffer.
			const raw = Uint8Array.from(atob(signedAuthEntry), (c) => c.charCodeAt(0));
			return StellarSdk.authorizeEntry(
				entry,
				async () => raw,
				signatureExpirationLedger,
				this.config.networkPassphrase
			);
		}
	}

	private async sendTransactionWithRetry(
		transaction: StellarSdk.Transaction
	): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
		for (let attempt = 0; attempt <= MAX_SEND_RETRIES; attempt += 1) {
			const response = await this.rpc.sendTransaction(transaction);

			switch (response.status) {
				case 'PENDING':
				case 'DUPLICATE':
					return response;
				case 'TRY_AGAIN_LATER':
					if (attempt === MAX_SEND_RETRIES) {
						throw new Error(
							'Network is busy — transaction not accepted after 3 retries.'
						);
					}

					await sleep(500 * 2 ** attempt);
					break;
				case 'ERROR':
					throw new Error(
						`Transaction send failed: ${JSON.stringify(response.errorResult)}`
					);
				default:
					throw new Error(`Unexpected send status: ${(response as { status: string }).status}`);
			}
		}

		throw new Error('Transaction send retry loop exited unexpectedly');
	}

	private async awaitTransaction(
		hash: string
	): Promise<{ hash: string; result?: StellarSdk.xdr.ScVal }> {
		const deadline = Date.now() + POLL_TIMEOUT_MS;
		let result = await this.rpc.getTransaction(hash);

		while (result.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND) {
			if (Date.now() > deadline) {
				throw new Error(
					'Transaction confirmation timed out — it may still be pending on-chain.'
				);
			}

			await sleep(POLL_INTERVAL_MS);
			result = await this.rpc.getTransaction(hash);
		}

		if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
			return { hash, result: result.returnValue };
		}

		if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
			throw new Error(`Transaction failed on-chain — hash: ${hash}`);
		}

		throw new Error(`Unexpected transaction status: ${(result as { status: string }).status}`);
	}
}
