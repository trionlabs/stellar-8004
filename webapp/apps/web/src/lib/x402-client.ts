// Browser-only — always lazy-import behind onMount in Svelte components
import { x402Client } from '@x402/core/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import type { ClientStellarSigner } from '@x402/stellar';
import { signer as freighterSigner, stellarConfig } from './sdk-client.js';

export function createX402Client(address: string): x402Client {
	const stellarSigner: ClientStellarSigner = {
		address,
		signAuthEntry: async (authEntry, opts?) => {
			// Defense-in-depth network guard. The PRIMARY check lives at the call
			// site (TryAgentPanel.sendX402PaidRequest validates
			// paymentRequired.accepts[].network before signing), because the current
			// @x402/stellar path does not populate opts.networkPassphrase. If a
			// future SDK version DOES pass it, refuse to sign for a network other
			// than the one the app/wallet is configured for.
			const requiredNetwork = opts?.networkPassphrase;
			if (requiredNetwork && requiredNetwork !== stellarConfig.networkPassphrase) {
				throw new Error(
					'Network mismatch: this payment requires a different Stellar network than the app is configured for. Refusing to sign.'
				);
			}
			const result = await freighterSigner.signAuthEntry(authEntry, {
				networkPassphrase: requiredNetwork || stellarConfig.networkPassphrase,
				address
			});
			if (result.error) {
				return {
					signedAuthEntry: '',
					signerAddress: result.signerAddress,
					error: result.error
				};
			}
			return {
				signedAuthEntry: result.signedAuthEntry,
				signerAddress: result.signerAddress || address
			};
		}
	};

	return new x402Client().register(
		'stellar:*',
		new ExactStellarScheme(stellarSigner, { url: stellarConfig.rpcUrl })
	);
}

export { decodePaymentRequiredHeader, encodePaymentSignatureHeader };
