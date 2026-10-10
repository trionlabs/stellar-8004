import {
	Account,
	Address,
	hash,
	Keypair,
	Networks,
	Operation,
	rpc,
	scValToNative,
	Transaction,
	TransactionBuilder,
	xdr
} from '@stellar/stellar-sdk';
import type { SignAuthEntry, SignTransaction } from '@stellar/stellar-sdk/contract';
import { Buffer } from 'buffer';
import { Challenge, Credential } from 'mppx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMppCredential, parseMppChallenge } from './mpp-client.js';

const wallet = vi.hoisted(() => ({
	signAuthEntry: vi.fn<SignAuthEntry>(),
	signTransaction: vi.fn<SignTransaction>()
}));
vi.mock('./sdk-client.js', () => ({
	signer: wallet,
	stellarConfig: {
		networkPassphrase: 'Test SDF Network ; September 2015',
		rpcUrl: 'https://rpc.example.com'
	}
}));

const keypair = Keypair.random();
const recipient = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
let preimage: xdr.HashIdPreimage | undefined;
let useV2: boolean;

function challenge(sponsored = true): Challenge.Challenge {
	return {
		id: 'test-challenge',
		realm: 'agent.example.com',
		method: 'stellar',
		intent: 'charge',
		expires: '2026-10-10T12:01:00.000Z',
		request: {
			amount: '10000',
			currency: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
			recipient,
			methodDetails: { network: 'stellar:testnet', feePayer: sponsored }
		}
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'));
	preimage = undefined;
	useV2 = false;
	wallet.signAuthEntry.mockReset().mockImplementation(async (encoded) => {
		preimage = xdr.HashIdPreimage.fromXdr(encoded, 'base64');
		return {
			signedAuthEntry: Buffer.from(keypair.sign(hash(preimage.toXdr()))).toString('base64'),
			signerAddress: keypair.publicKey()
		};
	});
	wallet.signTransaction.mockReset().mockImplementation(async (encoded) => {
		const tx = new Transaction(encoded, Networks.TESTNET);
		tx.sign(keypair);
		return { signedTxXdr: tx.toXdr(), signerAddress: keypair.publicKey() };
	});
	vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
		new Account(keypair.publicKey(), '7')
	);
	vi.spyOn(rpc.Server.prototype, 'getHealth').mockResolvedValue({
		status: 'healthy',
		latestLedger: 100,
		oldestLedger: 1,
		ledgerRetentionWindow: 100
	});
	vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(async (tx) => {
		if (!(tx instanceof Transaction)) throw new Error('Expected a standard transaction');
		const op = tx.operations[0];
		if (op.type !== 'invokeHostFunction' || op.func.type !== 'hostFunctionTypeInvokeContract') {
			throw new Error('Expected a contract invocation');
		}
		const entry = new xdr.SorobanAuthorizationEntry({
			credentials: (useV2
				? xdr.SorobanCredentials.sorobanCredentialsAddressV2
				: xdr.SorobanCredentials.sorobanCredentialsAddress)(
				new xdr.SorobanAddressCredentials({
					address: new Address(keypair.publicKey()).toScAddress(),
					nonce: 7n,
					signatureExpirationLedger: 0,
					signature: xdr.ScVal.scvVoid()
				})
			),
			rootInvocation: new xdr.SorobanAuthorizedInvocation({
				function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
					op.func.invokeContract
				),
				subInvocations: []
			})
		});
		return TransactionBuilder.cloneFrom(tx)
			.clearOperations()
			.addOperation(
				Operation.invokeHostFunction({
					func: op.func,
					auth: [entry]
				})
			)
			.build();
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('MPP payments', () => {
	it('round-trips the challenge header with the installed mppx parser', () => {
		const original = challenge();
		const response = new Response(null, {
			status: 402,
			headers: {
				'WWW-Authenticate': Challenge.serialize(original)
			}
		});
		expect(parseMppChallenge(response)).toMatchObject(original);
	});

	it.each([false, true])(
		'signs the V2=%s preimage and embeds a valid signature bounded by expiry',
		async (v2) => {
			useV2 = v2;
			const credential = Credential.deserialize<{ type: string; transaction: string }>(
				await createMppCredential(challenge(), keypair.publicKey())
			);
			const tx = new Transaction(credential.payload.transaction, Networks.TESTNET);
			const op = tx.operations[0];
			if (op.type !== 'invokeHostFunction') throw new Error('Expected a contract invocation');
			const entry = op.auth![0];
			const credentials = useV2
				? xdr.expectUnionVariant(entry.credentials, 'sorobanCredentialsAddressV2').addressV2
				: xdr.expectUnionVariant(entry.credentials, 'sorobanCredentialsAddress').address;
			const [signature] = scValToNative(credentials.signature);
			expect(credentials.signatureExpirationLedger).toBe(112);
			expect(preimage?.type).toBe(
				useV2 ? 'envelopeTypeSorobanAuthorizationWithAddress' : 'envelopeTypeSorobanAuthorization'
			);
			expect(keypair.verify(hash(preimage!.toXdr()), signature.signature)).toBe(true);
			expect(Array.from(signature.public_key)).toEqual(Array.from(keypair.rawPublicKey()));
			expect(credential.source).toBe(`did:pkh:stellar:testnet:${keypair.publicKey()}`);
			expect(tx.signatures).toHaveLength(0);
		}
	);

	it('signs the full transaction for an unsponsored charge', async () => {
		const credential = Credential.deserialize<{ transaction: string }>(
			await createMppCredential(challenge(false), keypair.publicKey())
		);
		const tx = new Transaction(credential.payload.transaction, Networks.TESTNET);
		expect(tx.source).toBe(keypair.publicKey());
		expect(tx.timeBounds?.maxTime).toBe('1791633660');
		expect(keypair.verify(tx.hash(), tx.signatures[0].signature.toBytes())).toBe(true);
	});

	it.each([true, false])('rejects wallet failure for sponsored=%s', async (sponsored) => {
		wallet.signAuthEntry.mockResolvedValue({
			signedAuthEntry: '',
			error: { message: 'User declined', code: -1 }
		});
		wallet.signTransaction.mockResolvedValue({
			signedTxXdr: '',
			signerAddress: keypair.publicKey(),
			error: { message: 'User declined', code: -1 }
		});
		await expect(createMppCredential(challenge(sponsored), keypair.publicKey())).rejects.toThrow(
			/declined/i
		);
	});

	it.each(['2026-10-10T11:59:59.000Z', 'invalid'])(
		'rejects expired or invalid expiration %s before signing',
		async (expires) => {
			await expect(
				createMppCredential({ ...challenge(), expires }, keypair.publicKey())
			).rejects.toThrow(/expir/i);
			expect(wallet.signAuthEntry).not.toHaveBeenCalled();
		}
	);

	it('rejects unknown networks before signing', async () => {
		const input = challenge();
		input.request.methodDetails = { network: 'stellar:unknown', feePayer: true };
		await expect(createMppCredential(input, keypair.publicKey())).rejects.toThrow(/network/i);
		expect(wallet.signAuthEntry).not.toHaveBeenCalled();
	});
});
