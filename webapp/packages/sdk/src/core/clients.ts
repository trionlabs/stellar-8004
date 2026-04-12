import type { ClientOptions } from '@stellar/stellar-sdk/contract';
import { Client as IdentityClient } from '../bindings/identity.js';
import { Client as ReputationClient } from '../bindings/reputation.js';
import { Client as ValidationClient } from '../bindings/validation.js';
import type { StellarConfig } from './config.js';

export interface ClientSet {
	identity: InstanceType<typeof IdentityClient>;
	reputation: InstanceType<typeof ReputationClient>;
	validation: InstanceType<typeof ValidationClient>;
}

export interface SignerOptions {
	publicKey: string;
	signTransaction: ClientOptions['signTransaction'];
	signAuthEntry?: ClientOptions['signAuthEntry'];
}

export function createClients(
	config: StellarConfig,
	signer: SignerOptions
): ClientSet {
	const baseOpts = {
		networkPassphrase: config.networkPassphrase,
		rpcUrl: config.rpcUrl,
		publicKey: signer.publicKey,
		signTransaction: signer.signTransaction!.bind(signer),
		signAuthEntry: signer.signAuthEntry?.bind(signer),
	};

	return {
		identity: new IdentityClient({
			...baseOpts,
			contractId: config.contracts.identity,
		}),
		reputation: new ReputationClient({
			...baseOpts,
			contractId: config.contracts.reputation,
		}),
		validation: new ValidationClient({
			...baseOpts,
			contractId: config.contracts.validation,
		}),
	};
}
