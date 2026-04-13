// Browser-only — always lazy-import behind onMount in Svelte components.
// mppx may reference globalThis.fetch and will crash during SSR.
import { Challenge, Credential, Receipt } from 'mppx';
import {
	Account,
	Address,
	BASE_FEE,
	Contract,
	TransactionBuilder,
	authorizeEntry,
	nativeToScVal,
	rpc,
	xdr as StellarXdr
} from '@stellar/stellar-sdk';
import { signer as freighterSigner, stellarConfig } from './sdk-client.js';

// All-zeros placeholder for server-sponsored transactions (same as @stellar/mpp)
const ALL_ZEROS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const DEFAULT_LEDGER_CLOSE_TIME = 5;
const DEFAULT_TIMEOUT = 180;

// Allowlisted USDC SAC contract addresses. Prevents a malicious challenge from
// specifying a different token where base units have a different value than
// what the display assumes (7 decimals / USDC).
const USDC_ALLOWLIST = new Set([
	'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', // testnet USDC
	'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75', // mainnet USDC
]);

export interface MppPricingInfo {
	amount: string;
	currency: string;
	recipient: string;
	network: string;
	feePayer: boolean;
	description?: string;
	displayPrice: string;
}

/**
 * Parse an MPP challenge from a 402 response.
 * Uses mppx's Challenge.fromResponse() for correct WWW-Authenticate parsing.
 */
export function parseMppChallenge(response: Response): Challenge.Challenge | null {
	try {
		return Challenge.fromResponse(response);
	} catch {
		return null;
	}
}

/**
 * Extract pricing info from an MPP challenge for display in the UI.
 */
export function extractMppPricing(challenge: Challenge.Challenge, decimals = 7): MppPricingInfo {
	const request = challenge.request as Record<string, unknown>;
	const amount = String(request.amount ?? '0');
	const currency = String(request.currency ?? '');
	const recipient = String(request.recipient ?? '');
	const methodDetails = request.methodDetails as Record<string, unknown> | undefined;
	const network = String(methodDetails?.network ?? 'stellar:testnet');
	const feePayer = methodDetails?.feePayer === true;

	// Convert base units to display (e.g. 10000 with 7 decimals = $0.001)
	const num = Number(amount);
	const displayAmount = num / Math.pow(10, decimals);
	let displayPrice: string;
	if (displayAmount === 0) {
		displayPrice = '$0';
	} else if (displayAmount < 0.0001) {
		displayPrice = '< $0.0001';
	} else if (displayAmount < 0.01) {
		displayPrice = `$${displayAmount.toFixed(4)}`;
	} else {
		displayPrice = `$${displayAmount.toFixed(2)}`;
	}

	return {
		amount,
		currency,
		recipient,
		network,
		feePayer,
		description: challenge.description,
		displayPrice
	};
}

/**
 * Build and sign an MPP charge credential using Freighter wallet.
 * Replicates the logic from @stellar/mpp/charge/client/Charge.js
 * but uses Freighter signAuthEntry instead of Keypair.
 */
export async function createMppCredential(
	challenge: Challenge.Challenge,
	walletAddress: string
): Promise<string> {
	const request = challenge.request as Record<string, unknown>;
	const amount = String(request.amount);
	const currency = String(request.currency);
	const recipient = String(request.recipient);
	const methodDetails = request.methodDetails as Record<string, unknown> | undefined;
	const network = String(methodDetails?.network ?? 'stellar:testnet');
	const isServerSponsored = methodDetails?.feePayer === true;

	// Security: only allow known USDC contracts to prevent wallet drain via
	// a malicious challenge specifying a token with different decimals/value.
	if (!USDC_ALLOWLIST.has(currency)) {
		throw new Error(`Unsupported payment token: ${currency}. Only USDC is supported.`);
	}

	const networkPassphrase = network.includes('pubnet') || network.includes('mainnet')
		? 'Public Global Stellar Network ; September 2015'
		: 'Test SDF Network ; September 2015';

	const isMainnet = network.includes('pubnet') || network.includes('mainnet');
	const rpcUrl = isMainnet
		? 'https://soroban-mainnet.stellar.org'
		: stellarConfig.rpcUrl;

	// Network mismatch guard: compare challenge network with app's configured network
	const appIsTestnet = stellarConfig.networkPassphrase === 'Test SDF Network ; September 2015';
	if (isMainnet && appIsTestnet) {
		throw new Error('Network mismatch: agent requires Mainnet but your wallet is on Testnet. Switch to Mainnet.');
	}
	if (!isMainnet && !appIsTestnet) {
		throw new Error('Network mismatch: agent requires Testnet but your wallet is on Mainnet. Switch to Testnet.');
	}

	const server = new rpc.Server(rpcUrl);
	const contract = new Contract(currency);
	const stellarAmount = BigInt(amount);

	const expiresTimestamp = challenge.expires
		? Math.floor(new Date(challenge.expires).getTime() / 1000)
		: undefined;

	if (isServerSponsored) {
		// Sponsored path: build tx with placeholder source, sign only auth entries
		const placeholderSource = new Account(ALL_ZEROS, '0');
		const transferOp = contract.call(
			'transfer',
			new Address(walletAddress).toScVal(),
			new Address(recipient).toScVal(),
			nativeToScVal(stellarAmount, { type: 'i128' })
		);

		const builder = new TransactionBuilder(placeholderSource, {
			fee: BASE_FEE,
			networkPassphrase
		}).addOperation(transferOp);

		if (expiresTimestamp) {
			builder.setTimebounds(0, expiresTimestamp);
		} else {
			builder.setTimeout(DEFAULT_TIMEOUT);
		}

		const unsignedTx = builder.build();
		const prepared = await server.prepareTransaction(unsignedTx);

		// Calculate auth entry expiration ledger
		const latestLedger = await server.getLatestLedger();
		let validUntilLedger: number;
		if (expiresTimestamp) {
			const nowSecs = Math.floor(Date.now() / 1000);
			const secsUntilExpiry = Math.max(expiresTimestamp - nowSecs, 0);
			validUntilLedger = latestLedger.sequence + Math.ceil(secsUntilExpiry / DEFAULT_LEDGER_CLOSE_TIME);
		} else {
			validUntilLedger = latestLedger.sequence + Math.ceil(DEFAULT_TIMEOUT / DEFAULT_LEDGER_CLOSE_TIME) + 10;
		}

		// Sign auth entries via Freighter (not full envelope)
		const envelope = prepared.toEnvelope();
		const v1 = envelope.v1();
		for (const op of v1.tx().operations()) {
			const body = op.body();
			if (body.switch().value !== StellarXdr.OperationType.invokeHostFunction().value) {
				continue;
			}
			const authEntries = body.invokeHostFunctionOp().auth();
			for (let i = 0; i < authEntries.length; i++) {
				const entry = authEntries[i];
				if (
					entry.credentials().switch().value ===
					StellarXdr.SorobanCredentialsType.sorobanCredentialsAddress().value
				) {
					// Use Freighter to sign the auth entry
					const entryXdr = entry.toXDR('base64');
					const result = await freighterSigner.signAuthEntry(entryXdr, {
						networkPassphrase,
						address: walletAddress
					});
					if (result.error) {
						throw new Error(String(result.error));
					}
					authEntries[i] = StellarXdr.SorobanAuthorizationEntry.fromXDR(
						result.signedAuthEntry,
						'base64'
					);
				}
			}
		}

		const signedXdr = envelope.toXDR('base64');
		const source = `did:pkh:stellar:${network.replace('stellar:', '')}:${walletAddress}`;

		return Credential.serialize({
			challenge,
			payload: { type: 'transaction', transaction: signedXdr },
			source
		});
	}

	// Unsponsored path: build and sign full transaction
	const sourceAccount = await server.getAccount(walletAddress);
	const transferOp = contract.call(
		'transfer',
		new Address(walletAddress).toScVal(),
		new Address(recipient).toScVal(),
		nativeToScVal(stellarAmount, { type: 'i128' })
	);

	const builder = new TransactionBuilder(sourceAccount, {
		fee: BASE_FEE,
		networkPassphrase
	}).addOperation(transferOp);

	if (expiresTimestamp) {
		builder.setTimebounds(0, expiresTimestamp);
	} else {
		builder.setTimeout(DEFAULT_TIMEOUT);
	}

	const transaction = builder.build();
	const prepared = await server.prepareTransaction(transaction);

	// Sign full transaction via Freighter signTransaction
	const { signedTxXdr } = await freighterSigner.signTransaction(prepared.toXDR(), {
		networkPassphrase
	});

	const source = `did:pkh:stellar:${network.replace('stellar:', '')}:${walletAddress}`;

	return Credential.serialize({
		challenge,
		payload: { type: 'transaction', transaction: signedTxXdr },
		source
	});
}

/**
 * Parse the Payment-Receipt from a successful MPP response.
 */
export function parseMppReceipt(response: Response): { reference: string | null; status: string } {
	try {
		const receipt = Receipt.fromResponse(response);
		return {
			reference: receipt.reference ?? null,
			status: receipt.status ?? 'unknown'
		};
	} catch {
		return { reference: null, status: 'unknown' };
	}
}

export { Challenge, Credential, Receipt };
