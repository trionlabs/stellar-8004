import { env } from '$env/dynamic/public';

const segment = env.PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';

export const explorerTxUrl = (hash: string) =>
	`https://stellar.expert/explorer/${segment}/tx/${hash}`;

export const explorerContractUrl = (id: string) =>
	`https://stellar.expert/explorer/${segment}/contract/${id}`;

export const explorerAccountUrl = (address: string) =>
	`https://stellar.expert/explorer/${segment}/account/${address}`;

export const explorerLedgerUrl = (seq: number) =>
	`https://stellar.expert/explorer/${segment}/ledger/${seq}`;
