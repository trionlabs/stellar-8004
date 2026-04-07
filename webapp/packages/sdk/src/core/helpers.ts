import * as StellarSdk from '@stellar/stellar-sdk';

export interface GasEstimate {
	minResourceFee: string;
	instructions: string;
	readBytes: number;
	writeBytes: number;
	footprint: {
		readOnly: number;
		readWrite: number;
	};
}

export async function fundTestnet(address: string): Promise<void> {
	const response = await fetch(
		`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`
	);

	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		const suffix = detail ? ` - ${detail}` : '';
		throw new Error(`Friendbot failed: ${response.status}${suffix}`);
	}
}

/** Maximum tag length for feedback tags. Soroban String has practical limits; keeping tags short avoids simulation failures with unhelpful errors. */
export const MAX_TAG_LENGTH = 64;

/** Validates feedback tag length. Throws if tag exceeds MAX_TAG_LENGTH. */
export function validateTag(tag: string, label = 'Tag'): void {
	if (tag.length > MAX_TAG_LENGTH) {
		throw new Error(`${label} too long (${tag.length} chars, max ${MAX_TAG_LENGTH})`);
	}
}

/**
 * Generate a unique nonce for a validation request.
 * This is NOT a content hash - it is a random unique identifier
 * used as a lookup key on-chain for `get_validation_status`.
 */
export async function generateRequestNonce(
	agentId: number,
	validatorAddress: string
): Promise<Uint8Array> {
	const encoder = new TextEncoder();
	const data = encoder.encode(
		`${agentId}:${validatorAddress}:${Date.now()}:${crypto.randomUUID()}`
	);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return new Uint8Array(hashBuffer);
}

/**
 * Validates that a string is a valid Stellar address.
 * Accepts both ed25519 public keys (G...) and contract addresses (C...) so that
 * smart-contract / passkey wallets can be used as agent owners or wallets.
 */
export function validateStellarAddress(address: string, label = 'Address'): void {
	if (
		!StellarSdk.StrKey.isValidEd25519PublicKey(address) &&
		!StellarSdk.StrKey.isValidContract(address)
	) {
		throw new Error(`${label} is not a valid Stellar address`);
	}
}

/** Maps opaque Soroban/wallet errors to user-friendly messages. */
export function formatSorobanError(err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	if (/User declined|rejected|denied/i.test(msg)) return 'Transaction cancelled in wallet.';
	if (/network.*mismatch/i.test(msg)) return 'Wallet is on a different network than the app.';
	if (/Budget.*LimitExceeded/i.test(msg)) return 'Transaction resource limit exceeded. Try a simpler operation.';
	if (/insufficient.*balance/i.test(msg)) return 'Insufficient XLM balance for transaction fees.';
	if (/expired/i.test(msg)) return 'Transaction expired. Please try again.';
	if (/timeout|ETIMEDOUT/i.test(msg)) return 'Network timeout. Check your connection and try again.';
	return msg.length > 200 ? msg.slice(0, 200) + '...' : msg;
}

export function estimateGas(
	simulation: StellarSdk.rpc.Api.SimulateTransactionResponse
): GasEstimate {
	if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
		throw new Error(`Simulation failed: ${simulation.error}`);
	}

	const resources = simulation.transactionData.build().resources();

	return {
		minResourceFee: simulation.minResourceFee,
		instructions: resources.instructions().toString(),
		readBytes: Number(resources.diskReadBytes()),
		writeBytes: Number(resources.writeBytes()),
		footprint: {
			readOnly: simulation.transactionData.getReadOnly().length,
			readWrite: simulation.transactionData.getReadWrite().length
		}
	};
}
