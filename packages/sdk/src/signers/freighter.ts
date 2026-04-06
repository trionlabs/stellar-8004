import type { WalletError } from './interface.js';
import type { WalletSigner } from './interface.js';

const CONNECT_TIMEOUT_MS = 30_000;
const DETECT_RETRY_DELAY_MS = 500;
const DETECT_MAX_RETRIES = 4;

interface FreighterApiLike {
	isConnected(): Promise<{ isConnected: boolean; error?: WalletError }>;
	isAllowed(): Promise<{ isAllowed: boolean; error?: WalletError }>;
	requestAccess(): Promise<{ address: string; error?: WalletError }>;
	getAddress(): Promise<{ address: string; error?: WalletError }>;
	getNetwork(): Promise<{ network: string; networkPassphrase: string; error?: WalletError }>;
	signTransaction: WalletSigner['signTransaction'];
	signAuthEntry(
		authEntry: string,
		opts?: { networkPassphrase?: string; address?: string }
	): Promise<{ signedAuthEntry: string | null; signerAddress?: string; error?: WalletError }>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

function expectedNetworkLabel(networkPassphrase: string): string {
	return networkPassphrase === 'Public Global Stellar Network ; September 2015'
		? 'Public'
		: 'Testnet';
}

export class FreighterSigner implements WalletSigner {
	publicKey = '';

	private api?: FreighterApiLike;

	private async getApi(): Promise<FreighterApiLike> {
		if (this.api) return this.api;

		try {
			const module = (await import('@stellar/freighter-api')) as unknown as FreighterApiLike;
			this.api = module;
			return module;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(
				`@stellar/freighter-api is required to use FreighterSigner: ${message}`
			);
		}
	}

	async detectFreighter(): Promise<boolean> {
		const api = await this.getApi();

		for (let attempt = 0; attempt <= DETECT_MAX_RETRIES; attempt += 1) {
			try {
				const result = await api.isConnected();
				if (result.isConnected) return true;
			} catch {
				// Retry while the extension finishes loading into the page.
			}

			if (attempt < DETECT_MAX_RETRIES) {
				await new Promise((resolve) => setTimeout(resolve, DETECT_RETRY_DELAY_MS));
			}
		}

		return false;
	}

	async connect(): Promise<string> {
		const api = await this.getApi();
		const installed = await this.detectFreighter();

		if (!installed) {
			throw new Error('Freighter wallet not detected. Install it or refresh the page.');
		}

		const access = await withTimeout(
			api.requestAccess(),
			CONNECT_TIMEOUT_MS,
			'Wallet connection'
		);

		if (access.error) {
			throw new Error(access.error.message ?? 'Failed to connect Freighter');
		}

		const address = access.address || (await api.getAddress()).address;
		if (!address) {
			throw new Error('No address returned from Freighter');
		}

		this.publicKey = address;
		return address;
	}

	async signTransaction(
		xdr: string,
		opts?: { networkPassphrase?: string; address?: string }
	) {
		const api = await this.getApi();
		const address = opts?.address ?? this.publicKey;

		if (!address) {
			throw new Error('FreighterSigner is not connected. Call connect() first.');
		}

		await this.syncNetwork(opts?.networkPassphrase);

		return api.signTransaction(xdr, {
			networkPassphrase: opts?.networkPassphrase,
			address
		});
	}

	async signAuthEntry(
		authEntry: string,
		opts?: { networkPassphrase?: string; address?: string }
	) {
		const api = await this.getApi();

		if (!this.publicKey) {
			throw new Error('FreighterSigner is not connected. Call connect() first.');
		}

		await this.syncNetwork(opts?.networkPassphrase);

		const result = await api.signAuthEntry(authEntry, {
			networkPassphrase: opts?.networkPassphrase,
			address: opts?.address ?? this.publicKey
		});

		if (result.error) {
			return {
				signedAuthEntry: '',
				signerAddress: result.signerAddress,
				error: result.error
			};
		}

		if (!result.signedAuthEntry) {
			return {
				signedAuthEntry: '',
				signerAddress: result.signerAddress,
				error: { message: 'No signed auth entry returned', code: -1 }
			};
		}

		// Freighter may return a Buffer (Node) or string (browser).
		// Normalize to base64 string for WalletSigner compatibility.
		const signed =
			typeof result.signedAuthEntry === 'string'
				? result.signedAuthEntry
				: (result.signedAuthEntry as unknown as { toString(encoding: string): string }).toString('base64');

		return {
			signedAuthEntry: signed,
			signerAddress: result.signerAddress
		};
	}

	async syncNetwork(networkPassphrase?: string): Promise<void> {
		if (!networkPassphrase) return;

		const api = await this.getApi();
		const result = await api.getNetwork();

		if (result.error) {
			throw new Error(result.error.message ?? 'Failed to read Freighter network');
		}

		if (result.networkPassphrase !== networkPassphrase) {
			throw new Error(
				`Freighter is on ${result.network || 'unknown'} but this app requires ${expectedNetworkLabel(networkPassphrase)}. Switch network in Freighter settings.`
			);
		}
	}
}

export { withTimeout };
