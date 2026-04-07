import { signer, stellarConfig } from './sdk-client.js';

type FreighterApiModule = typeof import('@stellar/freighter-api');

async function loadFreighterApi(): Promise<FreighterApiModule> {
	return import('@stellar/freighter-api');
}

class WalletState {
	private readonly signer = signer;

	address = $state<string | null>(this.signer.publicKey || null);
	connected = $state(false);
	loading = $state(false);
	error = $state<string | null>(null);
	/** Network name reported by Freighter (e.g. "TESTNET", "PUBLIC") */
	network = $state<string | null>(null);
	/** True when Freighter is on a different network than the app config */
	networkMismatch = $state(false);

	get truncatedAddress(): string | null {
		if (!this.address) return null;
		return `${this.address.slice(0, 6)}...${this.address.slice(-4)}`;
	}

	/**
	 * Silently restore a previous session on page load.
	 * Only succeeds if Freighter is installed AND the site was already allowed.
	 */
	async restore(): Promise<void> {
		try {
			const installed = await this.signer.detectFreighter();
			if (!installed) return;

			const api = await loadFreighterApi();
			const { isAllowed: allowed } = await api.isAllowed();
			if (!allowed) return;

			const addrResult = await api.getAddress();
			if (addrResult.error || !addrResult.address) return;

			this.signer.publicKey = addrResult.address;
			this.address = addrResult.address;
			this.connected = true;
			await this.syncNetwork();
		} catch {
			// Silent — auto-reconnect is best-effort
		}
	}

	async connect(): Promise<void> {
		this.loading = true;
		this.error = null;

		try {
			const address = await this.signer.connect();
			this.address = address;
			this.connected = true;
			await this.syncNetwork();
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to connect wallet';
			this.error = msg;
		} finally {
			this.loading = false;
		}
	}

	disconnect(): void {
		this.address = null;
		this.connected = false;
		this.error = null;
		this.network = null;
		this.networkMismatch = false;
		this.signer.publicKey = '';
	}

	/**
	 * Query Freighter for its current network and compare with app config.
	 */
	private async syncNetwork(): Promise<void> {
		try {
			const api = await loadFreighterApi();
			const netResult = await api.getNetwork();
			if (netResult.error) return;

			this.network = netResult.network;
			this.networkMismatch = netResult.networkPassphrase !== stellarConfig.networkPassphrase;
		} catch {
			// Non-fatal — we'll catch mismatch at sign time
		}
	}
}

export const wallet = new WalletState();
