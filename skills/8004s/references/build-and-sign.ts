/**
 * Soroban Transaction Lifecycle Helper
 *
 * Every contract interaction on Soroban follows this lifecycle:
 * 1. Get account state via RPC
 * 2. Build transaction with contract.call()
 * 3. Simulate via RPC (get resource estimates)
 * 4. Assemble transaction with simulation results
 * 5. Sign via Freighter (returns XDR)
 * 6. Submit to RPC
 * 7. Poll for confirmation (2s intervals, 60s timeout)
 */

import * as StellarSdk from '@stellar/stellar-sdk';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

export async function buildAndSign(
  method: string,
  contractId: string,
  args: StellarSdk.xdr.ScVal[],
  signerAddress: string,
  signFn: (xdr: string) => Promise<string>,
  rpc: StellarSdk.rpc.Server,
  networkPassphrase: string,
): Promise<{ hash: string; result?: StellarSdk.xdr.ScVal }> {
  // 1. Get account state
  const account = await rpc.getAccount(signerAddress);
  const contract = new StellarSdk.Contract(contractId);

  // 2. Build transaction
  let tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(180)
    .build();

  // 3. Simulate
  const simulation = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
    throw new Error(`Simulation failed: ${simulation.error}`);
  }

  // 4. Assemble with simulation results
  tx = StellarSdk.rpc.assembleTransaction(tx, simulation).build();

  // 5. Sign
  const signedXdr = await signFn(tx.toXDR());
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    networkPassphrase,
  ) as StellarSdk.Transaction;

  // 6. Submit
  const response = await rpc.sendTransaction(signedTx);

  if (response.status === 'ERROR') {
    throw new Error(`Transaction failed: ${JSON.stringify(response.errorResult)}`);
  }
  if (response.status === 'TRY_AGAIN_LATER') {
    throw new Error('Network busy — retry in a few seconds.');
  }

  // 7. Poll for confirmation
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let result = await rpc.getTransaction(response.hash);
  while (result.status === 'NOT_FOUND') {
    if (Date.now() > deadline) {
      throw new Error('Transaction confirmation timed out.');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    result = await rpc.getTransaction(response.hash);
  }

  if (result.status === 'SUCCESS') {
    return { hash: response.hash, result: result.returnValue };
  }
  throw new Error(`Transaction failed on-chain: ${response.hash}`);
}