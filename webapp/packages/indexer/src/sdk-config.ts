// Vendored from webapp/packages/sdk/src/core/config.ts so the indexer can be
// consumed by the Deno edge runtime without resolving the @trionlabs/stellar8004
// workspace package. Keep in sync with the SDK after every contract redeploy.

export interface StellarConfig {
  network: 'testnet' | 'mainnet';
  rpcUrl: string;
  networkPassphrase: string;
  contracts: {
    identity: string;
    reputation: string;
    validation: string;
  };
  deployVersion?: string;
  deployLedger?: number;
}

export const TESTNET_CONFIG: StellarConfig = {
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  contracts: {
    identity: 'CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH',
    reputation: 'CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55',
    validation: 'CC5USZRO26MOIAVNYTTJDS63C2OBBLREOAOET4CPF2EZWO3YFKLMO3SL',
  },
  deployVersion: '2026-04-11',
  deployLedger: 1980692,
};

export const MAINNET_CONFIG: StellarConfig = {
  network: 'mainnet',
  rpcUrl: 'https://mainnet.sorobanrpc.com',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  contracts: {
    identity: 'CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35',
    reputation: 'CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA',
    validation: 'CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG',
  },
  deployVersion: '2026-04-11',
  deployLedger: 62071546,
};
