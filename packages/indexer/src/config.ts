export interface ContractAddresses {
  identity: string;
  reputation: string;
  validation: string;
}

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contracts: ContractAddresses;
}

export const TESTNET: NetworkConfig = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  contracts: {
    identity: 'CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ',
    reputation: 'CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4',
    validation: 'CA6GIV7QB4B3O5SBZZRL3E3XMFFECGRETSN4JXAYTFKF5HUTD4JY2SJQ',
  },
};

type GlobalWithEnv = typeof globalThis & {
  Deno?: { env?: { get?: (key: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

/**
 * Reads env vars in both Node and Deno runtimes.
 * Deno access is guarded because env permissions may be denied.
 */
function env(key: string): string | undefined {
  const runtime = globalThis as GlobalWithEnv;

  try {
    if (runtime.process?.env?.[key] !== undefined) {
      return runtime.process.env[key];
    }
  } catch {
    // Ignore missing Node globals.
  }

  try {
    if (typeof runtime.Deno?.env?.get === 'function') {
      return runtime.Deno.env.get(key);
    }
  } catch {
    // Ignore missing Deno globals or denied env permissions.
  }

  return undefined;
}

export function getConfig(): NetworkConfig {
  const network = env('STELLAR_NETWORK') ?? 'testnet';

  if (network === 'testnet') {
    return TESTNET;
  }

  return {
    rpcUrl: env('STELLAR_MAINNET_RPC_URL') ?? '',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    contracts: {
      identity: env('IDENTITY_REGISTRY') ?? '',
      reputation: env('REPUTATION_REGISTRY') ?? '',
      validation: env('VALIDATION_REGISTRY') ?? '',
    },
  };
}
