import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import { stellarConfig } from './stellar.js';

class WalletState {
	address = $state<string | null>(null);
	connected = $state(false);
	loading = $state(false);
	error = $state<string | null>(null);

	get truncatedAddress(): string | null {
		if (!this.address) return null;
		return `${this.address.slice(0, 6)}...${this.address.slice(-4)}`;
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
	}

	async sign(xdr: string): Promise<string> {
		if (!this.connected) throw new Error('Wallet not connected');

		const result = await signTransaction(xdr, {
			networkPassphrase: stellarConfig.networkPassphrase,
			address: this.address!
		});

		if (result.error) throw new Error(result.error.message ?? 'Signing failed');
		return result.signedTxXdr;
	}
}

export const wallet = new WalletState();
