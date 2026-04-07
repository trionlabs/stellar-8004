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

export const TESTNET: NetworkConfig = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  contracts: {
    identity: 'CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ',
    reputation: 'CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4',
    validation: 'CA6GIV7QB4B3O5SBZZRL3E3XMFFECGRETSN4JXAYTFKF5HUTD4JY2SJQ',
  },
  deployLedger: 1819978,
};

export const MAINNET: NetworkConfig = {
  rpcUrl: 'https://mainnet.sorobanrpc.com',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  contracts: {
    identity: 'CCSMX3YEKU7IZCZSLORUCX6MQEOV6WXWAGTOJZG5YITEBAEH2Q5JY4XE',
    reputation: 'CCIZJXEVL2DJXH772F7SX262M5SF7JNOIAROW2M7I6VTPOVCJ7KKM5HT',
    validation: 'CAI3ZKBNXC52F2DCEX2XQLXUTRAQKCPWUUXDELW5SPAF4GAW4HCQ4JT3',
  },
  deployLedger: 62001391,
};

import { env } from './env.js';

export function getConfig(): NetworkConfig {
  const network = env('STELLAR_NETWORK') ?? 'testnet';

  if (network === 'mainnet') {
    return {
      ...MAINNET,
      rpcUrl: env('STELLAR_MAINNET_RPC_URL') || MAINNET.rpcUrl,
    };
  }

  return TESTNET;
}
