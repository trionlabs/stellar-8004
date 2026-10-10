// Browser-only — always lazy-import behind onMount in Svelte components.
// mppx may reference globalThis.fetch and will crash during SSR.
import { Challenge, Credential, Receipt } from 'mppx';
import { Buffer } from 'buffer';
import {
	Account,
	Address,
	authorizeEntry,
	BASE_FEE,
	Contract,
	Operation,
	TransactionBuilder,
	nativeToScVal,
	rpc
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
	'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75' // mainnet USDC
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

	if (!['stellar:testnet', 'stellar:pubnet', 'stellar:mainnet'].includes(network)) {
		throw new Error(`Unsupported payment network: ${network}`);
	}
	const isMainnet = network === 'stellar:pubnet' || network === 'stellar:mainnet';
	const networkPassphrase = isMainnet
		? 'Public Global Stellar Network ; September 2015'
		: 'Test SDF Network ; September 2015';

	// Network mismatch guard: compare challenge network with app's configured network
	const appIsTestnet = stellarConfig.networkPassphrase === 'Test SDF Network ; September 2015';
	if (isMainnet && appIsTestnet) {
		throw new Error(
			'Network mismatch: agent requires Mainnet but your wallet is on Testnet. Switch to Mainnet.'
		);
	}
	if (!isMainnet && !appIsTestnet) {
		throw new Error(
			'Network mismatch: agent requires Testnet but your wallet is on Mainnet. Switch to Testnet.'
		);
	}

	// Use the app's configured RPC for whichever network it runs on. The guard
	// above guarantees the challenge network matches stellarConfig, so this is
	// always the correct endpoint — `soroban-mainnet.stellar.org` is not a usable
	// public SDF endpoint and previously broke every live mainnet charge (report #1).
	const server = new rpc.Server(stellarConfig.rpcUrl);
	const contract = new Contract(currency);
	const stellarAmount = BigInt(amount);

	const expiresTimestamp = challenge.expires
		? Math.floor(new Date(challenge.expires).getTime() / 1000)
		: undefined;

	if (
		expiresTimestamp !== undefined &&
		(!Number.isFinite(expiresTimestamp) || expiresTimestamp <= Math.floor(Date.now() / 1000))
	) {
		throw new Error('Payment challenge has an invalid or expired expiration time.');
	}

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
		const health = await server.getHealth();
		let validUntilLedger: number;
		if (expiresTimestamp) {
			const nowSecs = Math.floor(Date.now() / 1000);
			const secsUntilExpiry = Math.max(expiresTimestamp - nowSecs, 0);
			validUntilLedger =
				health.latestLedger + Math.ceil(secsUntilExpiry / DEFAULT_LEDGER_CLOSE_TIME);
		} else {
			validUntilLedger =
				health.latestLedger + Math.ceil(DEFAULT_TIMEOUT / DEFAULT_LEDGER_CLOSE_TIME) + 10;
		}

		const operation = prepared.operations[0];
		if (prepared.operations.length !== 1 || operation.type !== 'invokeHostFunction') {
			throw new Error('Unexpected sponsored payment operation.');
		}
		const auth = [];
		for (const entry of operation.auth ?? []) {
			const credentials =
				entry.credentials.type === 'sorobanCredentialsAddress'
					? entry.credentials.address
					: entry.credentials.type === 'sorobanCredentialsAddressV2'
						? entry.credentials.addressV2
						: null;
			if (!credentials || Address.fromScAddress(credentials.address).toString() !== walletAddress) {
				throw new Error('Unexpected payment authorization address.');
			}
			// Freighter signs a HashIdPreimage and returns signature bytes.
			// authorizeEntry binds the network/expiry and verifies the signature.
			auth.push(
				await authorizeEntry(
					entry,
					async (preimage) => {
						const result = await freighterSigner.signAuthEntry(preimage.toXdr('base64'), {
							networkPassphrase,
							address: walletAddress
						});
						if (result.error) {
							throw new Error(result.error.message ?? String(result.error));
						}
						if (!result.signedAuthEntry)
							throw new Error('Wallet returned no authorization signature.');
						return {
							signature: Buffer.from(result.signedAuthEntry, 'base64'),
							publicKey: walletAddress
						};
					},
					validUntilLedger,
					networkPassphrase
				)
			);
		}
		if (auth.length === 0) throw new Error('Payment simulation returned no authorization entries.');
		// The sponsor rebuilds and simulates this authorization proof before submission.
		const signedXdr = TransactionBuilder.cloneFrom(prepared)
			.clearOperations()
			.addOperation(
				Operation.invokeHostFunction({
					source: operation.source,
					func: operation.func,
					auth
				})
			)
			.build()
			.toXdr();

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
	const result = await freighterSigner.signTransaction(prepared.toXDR(), {
		networkPassphrase
	});

	if (result.error) throw new Error(result.error.message ?? String(result.error));
	if (!result.signedTxXdr) throw new Error('Wallet returned no signed transaction.');

	const source = `did:pkh:stellar:${network.replace('stellar:', '')}:${walletAddress}`;

	return Credential.serialize({
		challenge,
		payload: { type: 'transaction', transaction: result.signedTxXdr },
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
