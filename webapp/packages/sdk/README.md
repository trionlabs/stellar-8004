# @trionlabs/8004-sdk

TypeScript SDK for ERC-8004 agent registration, storage, signing, and explorer reads on Stellar.

## Install

```bash
npm install @trionlabs/8004-sdk @stellar/stellar-sdk
# or: pnpm add @trionlabs/8004-sdk @stellar/stellar-sdk

# Browser signer support (optional)
npm install @stellar/freighter-api
```

Node 18+ is supported.

## Quick Start

```ts
import { Keypair } from '@stellar/stellar-sdk';
import {
  AutoStorage,
  SorobanClient,
  TESTNET_CONFIG,
  buildMetadataJson,
  fundTestnet,
  wrapBasicSigner
} from '@trionlabs/8004-sdk';

const secret = process.env.STELLAR_SECRET_KEY;
if (!secret) throw new Error('Missing STELLAR_SECRET_KEY');

const keypair = Keypair.fromSecret(secret);
const signer = wrapBasicSigner(keypair, TESTNET_CONFIG.networkPassphrase);
const client = new SorobanClient(signer, TESTNET_CONFIG);

await fundTestnet(signer.publicKey);

const metadata = buildMetadataJson({
  name: 'DataBot',
  description: 'Real-time market data feed',
  imageUrl: 'https://example.com/avatar.png',
  services: [
    { name: 'quotes', endpoint: 'https://api.example.com/quotes', version: 'v1' }
  ],
  supportedTrust: ['crypto-economic'],
  x402Enabled: true
});

const storage = new AutoStorage({
  pinataJwt: process.env.PINATA_JWT
});

const agentUri = await storage.upload(metadata);
const result = await client.registerAgent(agentUri);

console.log(result.agentId, result.hash);
```

## Main APIs

### `SorobanClient`

Write client for on-chain contract actions:

- `registerAgent(agentUri?)`
- `updateAgentUri(agentId, newUri)`
- `setAgentWallet(agentId, newWallet)`
- `unsetAgentWallet(agentId)`
- `giveFeedback(params)`
- `requestValidation(params)`

### `ExplorerClient`

Read-only wrapper for the public explorer API:

```ts
import { ExplorerClient } from '@trionlabs/8004-sdk';

const explorer = new ExplorerClient('https://stellar8004.com');
const agents = await explorer.getAgents({ page: 1, limit: 10 });
const stats = await explorer.getStats();
```

### Storage

- `AutoStorage` chooses `data:` URIs under the 8KB limit and falls back to Pinata/IPFS when configured.
- `DataUriStorage` stores metadata entirely inside a `data:` URI.
- `PinataStorage` uploads JSON metadata and returns an `ipfs://` URI.

### Signers

- `wrapBasicSigner(keypair, networkPassphrase)` for Node scripts and automation.
- `FreighterSigner` for browser wallet flows. `@stellar/freighter-api` remains an optional peer dependency.
- `WalletSigner` is the shared interface used by `SorobanClient`.

## Subpath Imports

```ts
import { FreighterSigner } from '@trionlabs/8004-sdk/signers/freighter';
import { wrapBasicSigner } from '@trionlabs/8004-sdk/signers/basic';
import { AutoStorage } from '@trionlabs/8004-sdk/storage/auto';
```

## Links

- Docs: https://stellar8004.com/developers
- Explorer API: https://stellar8004.com/api/v1/agents
- Repository: https://github.com/trionlabs/stellar-8004
- Issues: https://github.com/trionlabs/stellar-8004/issues

## License

See [LICENSE](./LICENSE).
