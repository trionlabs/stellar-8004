// Browser-only — always lazy-import behind onMount in Svelte components
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import type { ClientStellarSigner } from '@x402/stellar';
import { signer as freighterSigner, stellarConfig } from './sdk-client.js';

export function createX402Client(address: string): {
	client: x402Client;
	httpClient: x402HTTPClient;
} {
	const stellarSigner: ClientStellarSigner = {
		address,
		signAuthEntry: async (authEntry, opts?) => {
			const result = await freighterSigner.signAuthEntry(authEntry, {
				networkPassphrase: opts?.networkPassphrase || stellarConfig.networkPassphrase,
				address
			});
			// Return error object (don't throw) — matches SignAuthEntry contract.
			// x402 internals check result.error; throwing would bypass that handling.
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

	const client = new x402Client().register(
		'stellar:*',
		new ExactStellarScheme(stellarSigner, { url: stellarConfig.rpcUrl })
	);
	const httpClient = new x402HTTPClient(client);
	return { client, httpClient };
}

export { x402Client, x402HTTPClient };
