import { MAINNET_CONFIG as SDK_MAINNET, TESTNET_CONFIG as SDK_TESTNET } from '@trionlabs/stellar8004';
import { describe, expect, it } from 'vitest';

import { MAINNET_CONFIG, TESTNET_CONFIG } from './sdk-config.js';

// sdk-config.ts is hand-vendored from packages/sdk so the indexer can run under
// Deno without resolving the workspace package. These assertions are the drift
// guard the vendoring otherwise lacks: the contract addresses and deploy ledger
// drive WHICH chain state the indexer reads, so a stale copy after a redeploy
// would silently index the wrong contracts. If this fails, re-vendor sdk-config.
describe('sdk-config stays in sync with @trionlabs/stellar8004', () => {
  it('testnet contracts, passphrase, and deploy ledger match the SDK', () => {
    expect(TESTNET_CONFIG.contracts).toEqual(SDK_TESTNET.contracts);
    expect(TESTNET_CONFIG.networkPassphrase).toBe(SDK_TESTNET.networkPassphrase);
    expect(TESTNET_CONFIG.deployLedger).toBe(SDK_TESTNET.deployLedger);
  });

  it('mainnet contracts, passphrase, and deploy ledger match the SDK', () => {
    expect(MAINNET_CONFIG.contracts).toEqual(SDK_MAINNET.contracts);
    expect(MAINNET_CONFIG.networkPassphrase).toBe(SDK_MAINNET.networkPassphrase);
    expect(MAINNET_CONFIG.deployLedger).toBe(SDK_MAINNET.deployLedger);
  });
});
