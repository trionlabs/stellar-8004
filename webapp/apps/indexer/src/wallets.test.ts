import {
	Address,
	Keypair,
	Networks,
	SorobanDataBuilder,
	TransactionBuilder,
	scValToNative,
	xdr,
	type Operation
} from '@stellar/stellar-sdk';
import { createTestD1 } from '@stellar8004/d1/test-db';
import { afterEach, expect, it, vi } from 'vitest';
import { MAINNET_CONFIG } from '../../../packages/indexer/src/sdk-config.js';
import { rows } from './test-helpers.js';
import { identityClient, syncWallets } from './wallets.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

it('sets each wallet from a simulated get_agent_wallet call on the identity contract', async () => {
	const db = createTestD1();
	for (const id of [1, 2])
		await db.prepare("INSERT INTO agents (id, owner) VALUES (?, 'GOWNER')").bind(id).run();
	const wallet = Keypair.random().publicKey();
	const returns = [new Address(wallet).toScVal(), xdr.ScVal.scvVoid()]; // Some(wallet), then None
	const calls: Array<{ method: string; params: { transaction: string } }> = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			const request = JSON.parse(String(init.body));
			calls.push(request);
			const result = {
				latestLedger: 100,
				minResourceFee: '100',
				transactionData: new SorobanDataBuilder().build().toXDR('base64'),
				results: [{ auth: [], xdr: returns.shift()!.toXDR('base64') }]
			};
			return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
		})
	);

	expect(await syncWallets(db, identityClient('https://rpc.example'), [1, 2])).toBe(2);

	expect(await rows(db, 'SELECT id, wallet FROM agents ORDER BY id')).toEqual([
		{ id: 1, wallet },
		{ id: 2, wallet: null }
	]);
	expect(calls.map((call) => call.method)).toEqual(['simulateTransaction', 'simulateTransaction']);
	const transaction = TransactionBuilder.fromXDR(calls[0].params.transaction, Networks.PUBLIC);
	const operation = transaction.operations[0] as Operation.InvokeHostFunction;
	expect(operation.func.type).toBe('hostFunctionTypeInvokeContract');
	const invocation = (
		operation.func as Extract<xdr.HostFunction, { type: 'hostFunctionTypeInvokeContract' }>
	).invokeContract;
	expect(Address.fromScAddress(invocation.contractAddress).toString()).toBe(
		MAINNET_CONFIG.contracts.identity
	);
	expect(invocation.functionName.toString()).toBe('get_agent_wallet');
	expect(invocation.args.map((arg) => scValToNative(arg))).toEqual([1]);
});
