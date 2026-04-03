import freighterApi from '@stellar/freighter-api';
const { isConnected, isAllowed, requestAccess, getAddress, getNetwork, signTransaction } =
	freighterApi;
import { stellarConfig } from './stellar.js';

class WalletState {
	address = $state<string | null>(null);
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
			const { isConnected: installed } = await isConnected();
			if (!installed) return;

			const { isAllowed: allowed } = await isAllowed();
			if (!allowed) return;

			const addrResult = await getAddress();
			if (addrResult.error || !addrResult.address) return;

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
			const { isConnected: installed } = await isConnected();
			if (!installed) {
				this.error = 'Freighter wallet is not installed';
				return;
			}

			const result = await requestAccess();
			if (result.error) {
				this.error = result.error.message ?? 'Failed to connect';
				return;
			}

			this.address = result.address;
			this.connected = true;
			await this.syncNetwork();
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Failed to connect wallet';
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
	}

	async sign(xdr: string): Promise<string> {
		if (!this.connected) throw new Error('Wallet not connected');

		// Re-check network right before signing
		await this.syncNetwork();
		if (this.networkMismatch) {
			const expected = stellarConfig.network === 'mainnet' ? 'Public' : 'Testnet';
			throw new Error(
				`Freighter is on ${this.network ?? 'unknown'} but this app requires ${expected}. Switch network in Freighter settings.`
			);
		}

		const result = await signTransaction(xdr, {
			networkPassphrase: stellarConfig.networkPassphrase,
			address: this.address!
		});

		if (result.error) throw new Error(result.error.message ?? 'Signing failed');
		return result.signedTxXdr;
	}

	/**
	 * Query Freighter for its current network and compare with app config.
	 */
	private async syncNetwork(): Promise<void> {
		try {
			const netResult = await getNetwork();
			if (netResult.error) return;

			this.network = netResult.network;
			this.networkMismatch = netResult.networkPassphrase !== stellarConfig.networkPassphrase;
		} catch {
			// Non-fatal — we'll catch mismatch at sign time
		}
	}
}

export const wallet = new WalletState();
