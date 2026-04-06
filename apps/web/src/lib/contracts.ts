/**
 * Client-only contract interaction functions.
 * These import the wallet rune store and MUST only be called from
 * client-side Svelte components, never from +page.server.ts or hooks.
 */
import * as StellarSdk from '@stellar/stellar-sdk';
import { getRpc, getStellarConfig } from './stellar.js';
import { wallet } from './wallet.svelte.js';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;
const MAX_URI_LENGTH = 8192;
const SAFE_SCHEMES = ['https://', 'http://', 'ipfs://', 'data:application/json'];

function validateUri(uri: string): void {
	if (uri.length > MAX_URI_LENGTH) {
		throw new Error(`Agent URI too large (max ${MAX_URI_LENGTH / 1024}KB)`);
	}
	if (!SAFE_SCHEMES.some((s) => uri.startsWith(s))) {
		throw new Error('Agent URI must use https://, http://, ipfs://, or data: scheme');
	}
}

/**
 * Soroban transaction lifecycle:
 * 1. Build transaction with contract.call()
 * 2. Simulate via RPC to get resource estimates
 * 3. Assemble transaction with simulation results
 * 4. Sign via Freighter wallet
 * 5. Send to RPC
 * 6. Poll for confirmation (with timeout)
 */
async function buildAndSign(
	method: string,
	contractId: string,
	args: StellarSdk.xdr.ScVal[]
): Promise<{ hash: string; result?: StellarSdk.xdr.ScVal }> {
	if (!wallet.address) throw new Error('Wallet not connected');

	const account = await getRpc().getAccount(wallet.address);
	const contract = new StellarSdk.Contract(contractId);

	let tx = new StellarSdk.TransactionBuilder(account, {
		fee: StellarSdk.BASE_FEE,
		networkPassphrase: getStellarConfig().networkPassphrase
	})
		.addOperation(contract.call(method, ...args))
		.setTimeout(180)
		.build();

	const simulation = await getRpc().simulateTransaction(tx);
	if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
		throw new Error(`Simulation failed: ${simulation.error}`);
	}

	// Sign non-invoker auth entries (for dual-auth methods like set_agent_wallet)
	if (
		StellarSdk.rpc.Api.isSimulationSuccess(simulation) &&
		simulation.result?.auth
	) {
		for (let i = 0; i < simulation.result.auth.length; i++) {
			const entry = simulation.result.auth[i];
			const creds = entry.credentials();

			if (creds.switch().name === 'sorobanCredentialsAddress') {
				const entryAddress = StellarSdk.Address.fromScAddress(
					creds.address().address()
				).toString();

				if (entryAddress !== wallet.address) {
					// Non-invoker auth — sign via Freighter's signAuthEntry
					const entryXdr = entry.toXDR('base64');
					const signedXdr = await wallet.signAuth(entryXdr, entryAddress);
					simulation.result.auth[i] =
						StellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(signedXdr, 'base64');
				}
			}
		}
	}

	tx = StellarSdk.rpc.assembleTransaction(tx, simulation).build();

	const signedXdr = await wallet.sign(tx.toXDR());
	const signedTx = StellarSdk.TransactionBuilder.fromXDR(
		signedXdr,
		getStellarConfig().networkPassphrase
	) as StellarSdk.Transaction;

	const response = await getRpc().sendTransaction(signedTx);

	switch (response.status) {
		case 'PENDING':
		case 'DUPLICATE':
			break;
		case 'TRY_AGAIN_LATER':
			throw new Error('Network is busy — transaction not accepted. Retry in a few seconds.');
		case 'ERROR':
			throw new Error(`Transaction send failed: ${JSON.stringify(response.errorResult)}`);
		default:
			throw new Error(`Unexpected send status: ${(response as any).status}`);
	}

	const deadline = Date.now() + POLL_TIMEOUT_MS;
	let result = await getRpc().getTransaction(response.hash);
	while (result.status === 'NOT_FOUND') {
		if (Date.now() > deadline) {
			throw new Error('Transaction confirmation timed out — it may still be pending on-chain.');
		}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		result = await getRpc().getTransaction(response.hash);
	}

	if (result.status === 'SUCCESS') {
		return { hash: response.hash, result: result.returnValue };
	}

	if (result.status === 'FAILED') {
		throw new Error(`Transaction failed on-chain — hash: ${response.hash}`);
	}

	throw new Error(`Unexpected transaction status: ${(result as any).status}`);
}

// ─── Identity Registry ──────────────────────────────────────────────

/**
 * Register a new agent on the Identity Registry.
 *
 * Contract method: `register(Address)` → returns `u32(agent_id)`
 * Contract method: `register_with_uri(Address, String)` → returns `u32(agent_id)`
 */
export async function registerAgent(agentUri?: string): Promise<{ agentId: number; hash: string }> {
	if (agentUri) validateUri(agentUri);

	const ownerAddress = StellarSdk.nativeToScVal(wallet.address!, { type: 'address' });

	const args = agentUri
		? [ownerAddress, StellarSdk.nativeToScVal(agentUri, { type: 'string' })]
		: [ownerAddress];

	const method = agentUri ? 'register_with_uri' : 'register';
	const { hash, result } = await buildAndSign(method, getStellarConfig().contracts.identity, args);
	const agentId = result ? (StellarSdk.scValToNative(result) as number) : 0;
	return { agentId, hash };
}

/**
 * Update agent URI on the Identity Registry.
 *
 * Contract method: `set_agent_uri(Address, u32, String)` → emits `uri_updated` event
 * Auth: caller only (single require_auth)
 *
 * Verified against contract source: github.com/trionlabs/stellar-8004
 */
export async function updateAgentUri(
	agentId: number,
	newUri: string
): Promise<{ hash: string }> {
	validateUri(newUri);

	const args = [
		StellarSdk.nativeToScVal(wallet.address!, { type: 'address' }),
		StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
		StellarSdk.nativeToScVal(newUri, { type: 'string' })
	];

	const { hash } = await buildAndSign('set_agent_uri', getStellarConfig().contracts.identity, args);
	return { hash };
}

/**
 * Bind a wallet address to an agent.
 *
 * Contract method: `set_agent_wallet(Address, u32, Address)` → emits `wallet_set` event
 *
 * Dual-auth: contract calls require_auth() on BOTH caller (owner) and newWallet.
 * - If caller === newWallet: single Freighter signature suffices (invoker auth)
 * - If caller !== newWallet: buildAndSign auto-detects the non-invoker auth entry
 *   and prompts a second Freighter signAuthEntry call. The user must control both
 *   addresses in their Freighter wallet.
 *
 * Verified against contract source: github.com/trionlabs/stellar-8004
 */
export async function setAgentWallet(
	agentId: number,
	newWallet: string
): Promise<{ hash: string }> {
	if (!StellarSdk.StrKey.isValidEd25519PublicKey(newWallet)) {
		throw new Error('Invalid Stellar address');
	}

	const args = [
		StellarSdk.nativeToScVal(wallet.address!, { type: 'address' }),
		StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
		StellarSdk.nativeToScVal(newWallet, { type: 'address' })
	];
	const { hash } = await buildAndSign('set_agent_wallet', getStellarConfig().contracts.identity, args);
	return { hash };
}

/**
 * Remove the wallet binding from an agent.
 *
 * Contract method: `unset_agent_wallet(Address, u32)` → emits `wallet_removed` event
 * Auth: caller only (single require_auth)
 *
 * Verified against contract source: github.com/trionlabs/stellar-8004
 */
export async function unsetAgentWallet(
	agentId: number
): Promise<{ hash: string }> {
	const args = [
		StellarSdk.nativeToScVal(wallet.address!, { type: 'address' }),
		StellarSdk.nativeToScVal(agentId, { type: 'u32' })
	];
	const { hash } = await buildAndSign('unset_agent_wallet', getStellarConfig().contracts.identity, args);
	return { hash };
}

// ─── Reputation Registry ────────────────────────────────────────────

/**
 * Submit feedback for an agent on the Reputation Registry.
 *
 * Contract method: `give_feedback(
 *   Address(client), u32(agent_id), i128(value), u32(value_decimals),
 *   String(tag1), String(tag2), String(endpoint),
 *   String(feedback_uri), BytesN<32>(feedback_hash)
 * )` → returns `u64(feedback_index)`
 */
export async function giveFeedback(params: {
	agentId: number;
	value: number;
	valueDecimals: number;
	tag1: string;
	tag2: string;
	endpoint: string;
	feedbackUri: string;
	feedbackHash: Uint8Array;
}): Promise<{ hash: string }> {
	const args = [
		StellarSdk.nativeToScVal(wallet.address!, { type: 'address' }),
		StellarSdk.nativeToScVal(params.agentId, { type: 'u32' }),
		StellarSdk.nativeToScVal(BigInt(params.value), { type: 'i128' }),
		StellarSdk.nativeToScVal(params.valueDecimals, { type: 'u32' }),
		StellarSdk.nativeToScVal(params.tag1, { type: 'string' }),
		StellarSdk.nativeToScVal(params.tag2, { type: 'string' }),
		StellarSdk.nativeToScVal(params.endpoint, { type: 'string' }),
		StellarSdk.nativeToScVal(params.feedbackUri, { type: 'string' }),
		StellarSdk.nativeToScVal(params.feedbackHash, { type: 'bytes' })
	];

	const { hash } = await buildAndSign('give_feedback', getStellarConfig().contracts.reputation, args);
	return { hash };
}

// ─── Validation Registry ────────────────────────────────────────────

/**
 * Request validation for an agent from a specific validator.
 *
 * Contract method: `validation_request(
 *   Address(invoker), Address(validator), u32(agent_id),
 *   String(request_uri), BytesN<32>(request_hash)
 * )`
 */
export async function requestValidation(params: {
	agentId: number;
	validatorAddress: string;
	requestUri: string;
}): Promise<{ hash: string }> {
	const encoder = new TextEncoder();
	const data = encoder.encode(
		`${params.agentId}:${params.validatorAddress}:${Date.now()}:${crypto.randomUUID()}`
	);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const requestHash = new Uint8Array(hashBuffer);

	const args = [
		StellarSdk.nativeToScVal(wallet.address!, { type: 'address' }),
		StellarSdk.nativeToScVal(params.validatorAddress, { type: 'address' }),
		StellarSdk.nativeToScVal(params.agentId, { type: 'u32' }),
		StellarSdk.nativeToScVal(params.requestUri, { type: 'string' }),
		StellarSdk.nativeToScVal(requestHash, { type: 'bytes' })
	];

	const { hash } = await buildAndSign(
		'validation_request',
		getStellarConfig().contracts.validation,
		args
	);
	return { hash };
}
