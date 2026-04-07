import type {
	SignAuthEntry,
	SignTransaction
} from '@stellar/stellar-sdk/contract';

export type {
	SignAuthEntry,
	SignTransaction,
	WalletError
} from '@stellar/stellar-sdk/contract';

export interface WalletSigner {
	publicKey: string;
	signTransaction: SignTransaction;
	signAuthEntry: SignAuthEntry;
}
