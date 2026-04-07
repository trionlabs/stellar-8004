import { Keypair, contract } from '@stellar/stellar-sdk';
import type { WalletSigner } from './interface.js';

export function wrapBasicSigner(
	keypair: Keypair,
	networkPassphrase: string
): WalletSigner {
	const signer = contract.basicNodeSigner(keypair, networkPassphrase);

	return {
		publicKey: keypair.publicKey(),
		signTransaction: signer.signTransaction,
		signAuthEntry: signer.signAuthEntry
	};
}
