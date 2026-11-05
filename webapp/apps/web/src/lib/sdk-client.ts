import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { createClients, getConfig, type StellarConfig } from '@trionlabs/stellar8004';
import { FreighterSigner } from '@trionlabs/stellar8004/signers/freighter';

const network = env.PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const baseConfig = getConfig(network);

// PUBLIC_STELLAR_RPC_URL may list several RPCs, comma-separated, in order of preference.
export const rpcUrls = (env.PUBLIC_STELLAR_RPC_URL || baseConfig.rpcUrl)
	.split(',')
	.map((url) => url.trim())
	.filter(Boolean);

export const stellarConfig: StellarConfig = {
	...baseConfig,
	rpcUrl: rpcUrls[0],
	contracts: {
		identity: env.PUBLIC_IDENTITY_REGISTRY || baseConfig.contracts.identity,
		reputation: env.PUBLIC_REPUTATION_REGISTRY || baseConfig.contracts.reputation,
		validation: env.PUBLIC_VALIDATION_REGISTRY || baseConfig.contracts.validation
	}
};

/**
 * Points stellarConfig at the first RPC that reports itself healthy, so wallet actions keep
 * working while one provider is down. Keeps the current RPC when none answers.
 * ponytail: checked once per page load; re-check before each transaction if outages turn out
 * to start mid-session.
 */
export async function selectHealthyRpc(
	urls: readonly string[] = rpcUrls,
	fetchImpl: typeof fetch = fetch
): Promise<string> {
	for (const url of urls) {
		try {
			const res = await fetchImpl(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
				signal: AbortSignal.timeout(4000)
			});
			const body = await res.json();
			if (body?.result?.status === 'healthy') {
				stellarConfig.rpcUrl = url;
				return url;
			}
		} catch {
			// Unreachable, slow or not JSON: try the next one.
		}
	}
	return stellarConfig.rpcUrl;
}

if (browser && rpcUrls.length > 1) void selectHealthyRpc();

export const signer = new FreighterSigner();

export function getClients() {
	if (!signer.publicKey) {
		throw new Error('Wallet not connected. Call signer.connect() first.');
	}
	return createClients(stellarConfig, signer);
}
