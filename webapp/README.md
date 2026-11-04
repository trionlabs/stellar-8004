# webapp - 8004scan explorer for Stellar

The frontend, indexer, and SDK that power [stellar8004.com](https://stellar8004.com), the explorer / discovery UI for the Stellar deployment of the [8004 standard](https://www.8004.org) (Trustless Agents). The contracts themselves live in the parent repo at [`../contracts`](../contracts).

## Layout

```
apps/web/         SvelteKit 5 frontend and the public /api/v1 (adapter-cloudflare, Workers)
apps/indexer/     Soroban event indexer and URI resolver (cron Worker) writing to D1
packages/sdk/     @trionlabs/stellar8004 - canonical TS SDK + auto-generated bindings
packages/d1/      D1 schema (migrations/), shared Db interface and an in-memory test D1
scripts/          seed and e2e helpers
```

The single source of truth for contract addresses is
[`packages/sdk/src/core/config.ts`](packages/sdk/src/core/config.ts) - the
indexer, scripts, and frontend env all import from there.

## Run locally

Use Node 22.12+ and the pnpm version pinned in `package.json`.

```bash
pnpm install
pnpm --filter @trionlabs/stellar8004 build   # build SDK once before web
cd apps/web
npx wrangler d1 migrations apply DB --local  # empty local D1 with the schema
pnpm dev                                     # http://localhost:5173
```

The local database starts empty; `apps/indexer` fills a D1 from chain events.

## Tests and checks

```bash
pnpm --filter @trionlabs/stellar8004 test   # SDK unit tests
pnpm --filter @stellar8004/d1 test          # schema, leaderboard view, test D1
pnpm --filter @stellar8004/indexer-d1 test  # indexer, parsers, resolver
pnpm --filter @stellar8004/web test         # loaders, API, payment signing
pnpm --filter @stellar8004/web check        # svelte-check + tsc
```

## Deploy

Everything runs on Cloudflare: both Workers bind the same D1 database by name.

- Schema: `npx wrangler d1 migrations apply DB --remote` from `apps/web`.
- Indexer: `npx wrangler deploy` from `apps/indexer` (runs every minute).
- Web: `pnpm --filter @stellar8004/web upload` tags a new version with the git
  commit (every response reports it in `X-Build`); test it with the
  `Cloudflare-Workers-Version-Overrides` header, then promote it with
  `wrangler versions deploy`.

## SDK quick start

```ts
import {
  TESTNET_CONFIG,
  createClients,
  FreighterSigner,
} from '@trionlabs/stellar8004';

const signer = new FreighterSigner();
await signer.connect();
const { identity, reputation, validation } = createClients(TESTNET_CONFIG, signer);

const tx = await identity.register_with_uri({
  caller: signer.publicKey,
  agent_uri: 'https://myagent.example/.well-known/agent-registration.json',
});
const { result: agentId } = await tx.signAndSend();
```

See [`packages/sdk/README.md`](packages/sdk/README.md) for the full SDK
surface.
