# webapp - 8004scan explorer for Stellar

The frontend, indexer, and SDK that power [stellar8004.com](https://stellar8004.com), the explorer / discovery UI for the Stellar deployment of [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) (Trustless Agents). The contracts themselves live in the parent repo at [`../contracts`](../contracts).

## Layout

```
apps/web/         SvelteKit 5 frontend (Tailwind, Svelte runes, adapter-node)
packages/sdk/     @trionlabs/8004-sdk - canonical TS SDK + auto-generated bindings
packages/indexer/ Soroban event indexer that writes to Supabase
packages/db/      Supabase-generated TypeScript types
supabase/         migrations, edge functions (api, indexer, resolve-uris, indexer-health)
docker/           self-hosted Supabase compose for Dokploy / VPS deploy
scripts/          backfill, recover, seed, e2e helpers
```

The single source of truth for contract addresses is
[`packages/sdk/src/core/config.ts`](packages/sdk/src/core/config.ts) - the
indexer, scripts, and frontend env all import from there.

## Run locally

```bash
pnpm install
pnpm --filter @trionlabs/8004-sdk build   # build SDK once before web
pnpm dev                                   # http://localhost:5173
```

The frontend talks to a Supabase instance for indexed data. For local
development point at the public hosted instance via `apps/web/.env`, or
spin up your own with `docker compose -f docker/docker-compose.supabase.yml up`
(see `docker/.env.example` - replace every `<<REQUIRED>>` value first).

## Tests and checks

```bash
pnpm --filter @trionlabs/8004-sdk test     # SDK unit tests (vitest)
pnpm --filter @stellar8004/indexer test    # indexer + parser tests
pnpm --filter @stellar8004/web check       # svelte-check + tsc
```

## Deploy

The web app, the self-hosted Supabase stack, and the indexer Edge Functions
are deployed to a VPS via Dokploy. The CI workflow at
[`../.github/workflows/deploy-webapp-vps.yml`](../.github/workflows/deploy-webapp-vps.yml)
SSH-pulls and runs the migrate + restart sequence on every push to `main`
that touches `webapp/packages/indexer/`, `webapp/supabase/`, or
`webapp/docker/`.

## SDK quick start

```ts
import {
  TESTNET_CONFIG,
  createClients,
  FreighterSigner,
} from '@trionlabs/8004-sdk';

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
