import * as StellarSdk from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { wrapBasicSigner } from '../src/signers/basic.js';

describe('wrapBasicSigner', () => {
	it('delegates signTransaction and signAuthEntry to basicNodeSigner', async () => {
		const keypair = StellarSdk.Keypair.random();
		const wrapped = wrapBasicSigner(keypair, StellarSdk.Networks.TESTNET);
		const basic = StellarSdk.contract.basicNodeSigner(
			keypair,
			StellarSdk.Networks.TESTNET
		);

		const tx = new StellarSdk.TransactionBuilder(
			new StellarSdk.Account(keypair.publicKey(), '0'),
			{
				fee: StellarSdk.BASE_FEE,
				networkPassphrase: StellarSdk.Networks.TESTNET
			}
		)
			.addOperation(
				StellarSdk.Operation.manageData({
					name: 'sdk-test',
					value: '1'
				})
			)
			.setTimeout(60)
			.build();

		const authEntry = Buffer.from('signed-auth-entry').toString('base64');
		const expectedTx = await basic.signTransaction(tx.toXDR(), {
			networkPassphrase: StellarSdk.Networks.TESTNET
		});
		const actualTx = await wrapped.signTransaction(tx.toXDR(), {
			networkPassphrase: StellarSdk.Networks.TESTNET
		});
		const expectedAuth = await basic.signAuthEntry(authEntry, {
			address: keypair.publicKey()
		});
		const actualAuth = await wrapped.signAuthEntry(authEntry, {
			address: keypair.publicKey()
		});

		expect(wrapped.publicKey).toBe(keypair.publicKey());
		expect(actualTx).toEqual(expectedTx);
		expect(actualAuth).toEqual(expectedAuth);
	});
});
