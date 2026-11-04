import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
	Address,
	Keypair,
	Networks,
	SorobanDataBuilder,
	StrKey,
	TransactionBuilder,
	scValToNative,
	xdr,
	type Operation
} from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAINNET_CONFIG } from '../../../packages/indexer/src/sdk-config.js';
import { parseIds } from '../scripts/wallets-to-sql.ts';
import { identityClient, readWallets, walletSql } from './wallets.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('readWallets', () => {
	it('reads each wallet with a simulated get_agent_wallet call on the identity contract', async () => {
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

		expect(await readWallets(identityClient('https://rpc.example'), [1, 2])).toEqual([
			{ id: 1, wallet },
			{ id: 2, wallet: null }
		]);
		expect(calls.map((call) => call.method)).toEqual([
			'simulateTransaction',
			'simulateTransaction'
		]);
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
});

describe('wallets-to-sql', () => {
	it('prints one UPDATE per agent, NULL where the contract holds no wallet', async () => {
		const wallet = Keypair.random().publicKey();
		const identity = {
			get_agent_wallet: vi.fn(async ({ agent_id }: { agent_id: number }) => ({
				result: agent_id === 3 ? wallet : undefined
			}))
		};
		const wallets = await readWallets(identity as never, parseIds('2-3'));
		expect(walletSql(wallets)).toBe(
			`UPDATE agents SET wallet = NULL WHERE id = 2;\nUPDATE agents SET wallet = '${wallet}' WHERE id = 3;\n`
		);
		expect(() => walletSql([{ id: 1, wallet: "x'; DROP TABLE agents; --" }])).toThrow(
			/Unexpected wallet/
		);
	});

	it('accepts only checksummed account, contract and muxed addresses', () => {
		const account = Keypair.random().publicKey();
		const contract = StrKey.encodeContract(Buffer.alloc(32, 7));
		const muxed = StrKey.encodeMed25519PublicKey(Buffer.alloc(40, 7));
		expect(
			walletSql([
				{ id: 1, wallet: account },
				{ id: 2, wallet: contract },
				{ id: 3, wallet: muxed }
			])
		).toBe(
			`UPDATE agents SET wallet = '${account}' WHERE id = 1;\n` +
				`UPDATE agents SET wallet = '${contract}' WHERE id = 2;\n` +
				`UPDATE agents SET wallet = '${muxed}' WHERE id = 3;\n`
		);
		const corrupted = account.slice(0, -1) + (account.endsWith('A') ? 'B' : 'A'); // bad checksum
		expect(() => walletSql([{ id: 4, wallet: corrupted }])).toThrow(/Unexpected wallet/);
	});

	it('takes a list and ranges of agent ids', () => {
		expect(parseIds('0-2,7, 9')).toEqual([0, 1, 2, 7, 9]);
		for (const bad of ['', '3-1', 'a', '1.5', '-1'])
			expect(() => parseIds(bad)).toThrow(/Invalid agent ids/);
	});

	it('runs with plain node (type stripping)', () => {
		const script = fileURLToPath(new URL('../scripts/wallets-to-sql.ts', import.meta.url));
		let stderr = '';
		try {
			execFileSync(process.execPath, [script], { stdio: 'pipe' });
		} catch (error) {
			stderr = String((error as { stderr: Buffer }).stderr);
		}
		expect(stderr).toContain('usage: node scripts/wallets-to-sql.ts');
	});
});
