# @trionlabs/stellar8004

TypeScript SDK for ERC-8004 agent registration, storage, signing, and explorer reads on Stellar.

## Install

```bash
npm install @trionlabs/stellar8004 @stellar/stellar-sdk
# or: pnpm add @trionlabs/stellar8004 @stellar/stellar-sdk

# Browser signer support (optional)
npm install @stellar/freighter-api
```

Node 22.12+ and Stellar SDK 17 are required. Contract byte fields and results use
`Uint8Array`; decode text with `new TextDecoder().decode(bytes)` or convert to
`Buffer` explicitly in Node before using encoding-specific methods.

## Quick Start

```ts
import { Keypair } from '@stellar/stellar-sdk';
import {
  AutoStorage,
  TESTNET_CONFIG,
  buildMetadataJson,
  createClients,
  fundTestnet,
  wrapBasicSigner
} from '@trionlabs/stellar8004';

const secret = process.env.STELLAR_SECRET_KEY;
if (!secret) throw new Error('Missing STELLAR_SECRET_KEY');

const keypair = Keypair.fromSecret(secret);
const signer = wrapBasicSigner(keypair, TESTNET_CONFIG.networkPassphrase);
const { identity } = createClients(TESTNET_CONFIG, signer);

await fundTestnet(signer.publicKey);

const metadata = buildMetadataJson({
  name: 'DataBot',
  description: 'Real-time market data feed',
  imageUrl: 'https://example.com/avatar.png',
  services: [
    { name: 'quotes', endpoint: 'https://api.example.com/quotes', version: 'v1' }
  ],
  supportedTrust: ['crypto-economic'],
  x402Enabled: true,
  mppEnabled: false
});

const storage = new AutoStorage({
  pinataJwt: process.env.PINATA_JWT
});

const agentUri = await storage.upload(metadata);
const tx = await identity.register_with_uri({ caller: signer.publicKey, agent_uri: agentUri });
const sent = await tx.signAndSend();

console.log(sent.result, sent.sendTransactionResponse?.hash); // agent ID, transaction hash
```

## Main APIs

### `createClients(config, signer)`

Returns `{ identity, reputation, validation }`, one typed client per registry. Each
method builds and simulates a transaction; call `signAndSend()` on it to submit, and
read the return value from `.result`.

- `identity`: `register`, `register_with_uri`, `register_full`, `set_agent_uri`, `set_metadata`, `set_agent_wallet`, `unset_agent_wallet`, and reads such as `agent_uri`, `owner_of`, `total_agents`
- `reputation`: `give_feedback`, `revoke_feedback`, `append_response`, `read_feedback`, `get_summary`
- `validation`: `validation_request`, `validation_response`, `get_validation_status`, `get_summary`

Validation `get_summary` averages answered validations only: up to 32 recent answers
from each of at most 5 listed validators, or the agent's 32 most recent answers when
the list is empty. Answers given before the v2 upgrade count once their validator
updates them. Validation and feedback tags are limited to 64 bytes (`validateTag`).

### `ExplorerClient`

Read-only wrapper for the public explorer API:

```ts
import { ExplorerClient } from '@trionlabs/stellar8004';

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
- `WalletSigner` is the shared signer interface. Any object with `publicKey` and `signTransaction` can be passed to `createClients`.

## Subpath Imports

```ts
import { FreighterSigner } from '@trionlabs/stellar8004/signers/freighter';
import { wrapBasicSigner } from '@trionlabs/stellar8004/signers/basic';
import { AutoStorage } from '@trionlabs/stellar8004/storage/auto';
```

## Changelog

### 0.0.12

- **Protocol 30:** requires `@stellar/stellar-sdk` 17.4+ (was 15). Older versions cannot read Protocol 30 ledger headers, which reach mainnet on 2026-11-23.
- **Breaking:** Node.js 22.12+ is required (was 18+). Contract byte fields are `Uint8Array` instead of `Buffer`.
- `ExplorerClient` keeps service `description` and `inputExample` ([#20](https://github.com/trionlabs/stellar-8004/issues/20)) and returns on-chain `metadata` keys verbatim.
- `formatSorobanError(err, registry?)` decodes contract error codes per registry. New: `isValidStellarAddress`, `InvalidInputError`.
- The Quick Start uses `createClients`. The previous example referenced a client that does not exist.

## Links

- Docs: https://stellar8004.com/developers
- Explorer API: https://stellar8004.com/api/v1/agents
- Repository: https://github.com/trionlabs/stellar-8004
- Issues: https://github.com/trionlabs/stellar-8004/issues

## License

See [LICENSE](./LICENSE).
