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

/**
 * Thrown by SDK input validators. formatSorobanError passes these through
 * unchanged, so local validation messages are never relabelled as wallet errors.
 */
export class InvalidInputError extends Error {
	override name = 'InvalidInputError';
}

/** Maximum tag length for feedback tags. Soroban String has practical limits; keeping tags short avoids simulation failures with unhelpful errors. */
export const MAX_TAG_LENGTH = 64;

/** Validates feedback tag length. Throws if tag exceeds MAX_TAG_LENGTH. */
export function validateTag(tag: string, label = 'Tag'): void {
	if (tag.length > MAX_TAG_LENGTH) {
		throw new InvalidInputError(`${label} too long (${tag.length} chars, max ${MAX_TAG_LENGTH})`);
	}
}

/**
 * Build a unique 32-byte request hash for `requestValidation`.
 *
 * Default mode (no `contentHash`): generates a random nonce derived from
 * agent_id + validator + timestamp + UUID. This is NOT a content commitment;
 * it is a unique lookup key for `get_validation_status` only.
 *
 * Spec-compliant mode (`contentHash` provided): uses the caller-supplied
 * 32-byte hash. ERC-8004 defines `request_hash` as `sha256(work)` so a
 * validator can verify that the request matches the work being attested.
 * Cross-chain interop with EVM ERC-8004 implementations requires this mode.
 */
export async function generateRequestNonce(
	agentId: number,
	validatorAddress: string,
	contentHash?: Uint8Array
): Promise<Uint8Array> {
	if (contentHash) {
		if (contentHash.length !== 32) {
			throw new Error(`contentHash must be 32 bytes, got ${contentHash.length}`);
		}
		return contentHash;
	}
	const encoder = new TextEncoder();
	const data = encoder.encode(
		`${agentId}:${validatorAddress}:${Date.now()}:${crypto.randomUUID()}`
	);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return new Uint8Array(hashBuffer);
}

/**
 * True if the string is a valid Stellar address, checksum included.
 * Accepts both ed25519 public keys (G...) and contract addresses (C...) so that
 * smart-contract / passkey wallets can be used as agent owners or wallets.
 */
export function isValidStellarAddress(address: string): boolean {
	return (
		StellarSdk.StrKey.isValidEd25519PublicKey(address) ||
		StellarSdk.StrKey.isValidContract(address)
	);
}

/** Validates a Stellar address (G... or C...). Throws InvalidInputError if invalid. */
export function validateStellarAddress(address: string, label = 'Address'): void {
	if (!isValidStellarAddress(address)) {
		throw new InvalidInputError(`${label} is not a valid Stellar address`);
	}
}

// Contract error codes to friendly messages.
const CONTRACT_ERRORS: Record<string, Record<number, string>> = {
	identity: {
		1: 'Not authorized (must be agent owner or approved operator).',
		4: 'A metadata key is too long (max 64 bytes).',
		5: 'A metadata value is too long (max 4096 bytes).',
		6: 'Too many metadata entries.',
		7: 'agentWallet is a reserved key - use the wallet binding UI.',
		8: 'Value cannot be empty.',
	},
	reputation: {
		1: 'You cannot give feedback to your own agent.',
		6: 'Agent not found.',
		7: 'Response URI cannot be empty.',
		8: 'Feedback value is out of the allowed range.',
		9: 'Client addresses are required for summary queries.',
		14: 'A tag is too long (max 64 bytes).',
	},
	validation: {
		1: 'Not authorized (must be agent owner or approved operator).',
		4: 'A validation request with this hash already exists.',
		5: 'Only the designated validator can respond.',
		12: 'The validator cannot be the agent itself: its owner, an approved operator, its agentWallet or the requester.',
		14: 'Too many validators for a summary (max 5).',
		15: 'A tag is too long (max 64 bytes).',
	},
};

/**
 * Maps opaque Soroban/wallet errors to user-friendly messages.
 * Contract error codes are only meaningful per registry (identity #8 and
 * reputation #8 differ), so pass the registry that was called to decode them.
 */
export function formatSorobanError(err: unknown, registry?: keyof typeof CONTRACT_ERRORS): string {
	const msg = err instanceof Error ? err.message : String(err);
	// SDK input validators throw InvalidInputError: show the message as-is.
	if (err instanceof Error && err.name === 'InvalidInputError') return msg;
	// Only explicit wallet rejections (Freighter: "The user rejected this request.").
	// A bare "rejected"/"denied" also matches RPC 403s and network-rejected transactions.
	if (/user declined|user rejected|rejected by (the )?user|denied by (the )?user/i.test(msg)) {
		return 'Transaction cancelled in wallet.';
	}
	// FreighterSigner's network-mismatch error is already user-facing and names both
	// networks, so it passes through unchanged.
	if (/Budget.*LimitExceeded/i.test(msg)) return 'Transaction resource limit exceeded. Try a simpler operation.';
	if (/insufficient.*balance/i.test(msg)) return 'Insufficient XLM balance for transaction fees.';
	if (/tx_?TOO_?LATE/i.test(msg)) return 'Transaction expired. Please try again.';
	if (/timeout|ETIMEDOUT/i.test(msg)) return 'Network timeout. Check your connection and try again.';

	// Try to decode Soroban contract error codes (e.g. "Error(Contract, #1)")
	const contractMatch = msg.match(/Error\(Contract,\s*#(\d+)\)/);
	if (contractMatch) {
		const code = parseInt(contractMatch[1], 10);
		return (registry && CONTRACT_ERRORS[registry][code]) || `Contract error #${code}.`;
	}

	if (msg.length > 200) {
		// eslint-disable-next-line no-console
		console.error('[formatSorobanError] full error:', err);
		return msg.slice(0, 200) + '... (see console for full error)';
	}
	return msg;
}

export function estimateGas(
	simulation: StellarSdk.rpc.Api.SimulateTransactionResponse
): GasEstimate {
	if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
		throw new Error(`Simulation failed: ${simulation.error}`);
	}

	const resources = simulation.transactionData.build().resources;

	return {
		minResourceFee: simulation.minResourceFee,
		instructions: resources.instructions.toString(),
		readBytes: resources.diskReadBytes,
		writeBytes: resources.writeBytes,
		footprint: {
			readOnly: simulation.transactionData.getReadOnly().length,
			readWrite: simulation.transactionData.getReadWrite().length
		}
	};
}
