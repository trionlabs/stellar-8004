// Single source of truth for contract addresses lives in the SDK at
// `@trionlabs/8004-sdk/src/core/config.ts`. The indexer reads them from
// there to avoid drift across packages.
import { MAINNET_CONFIG, TESTNET_CONFIG } from '@trionlabs/8004-sdk';

import { env } from './env.ts';

export interface ContractAddresses {
  identity: string;
  reputation: string;
  validation: string;
}

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contracts: ContractAddresses;
  deployLedger: number;
}

function fromSdkConfig(
  sdk: typeof TESTNET_CONFIG,
  rpcOverride: string | undefined,
): NetworkConfig {
  return {
    rpcUrl: rpcOverride || sdk.rpcUrl,
    networkPassphrase: sdk.networkPassphrase,
    contracts: { ...sdk.contracts },
    // Fall back to 0 (cold start from genesis) if the SDK config didn't
    // record a deploy ledger. The indexer's checkpoint cursor is the real
    // authority once the indexer has run at least once.
    deployLedger: sdk.deployLedger ?? 0,
  };
}

export const TESTNET: NetworkConfig = fromSdkConfig(TESTNET_CONFIG, undefined);
export const MAINNET: NetworkConfig = fromSdkConfig(MAINNET_CONFIG, undefined);

export function getConfig(): NetworkConfig {
  const network = env('STELLAR_NETWORK') ?? 'testnet';

  if (network === 'mainnet') {
    return fromSdkConfig(MAINNET_CONFIG, env('STELLAR_MAINNET_RPC_URL'));
  }

  return fromSdkConfig(TESTNET_CONFIG, env('STELLAR_RPC_URL'));
}
