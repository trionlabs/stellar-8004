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
			const result = await freighterSigner.signAuthEntry(authEntry, {
				networkPassphrase: opts?.networkPassphrase || stellarConfig.networkPassphrase,
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
