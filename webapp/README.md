# webapp - 8004scan explorer for Stellar

The frontend, indexer, and SDK that power [stellar8004.com](https://stellar8004.com), the explorer / discovery UI for the Stellar deployment of the [8004 standard](https://www.8004.org) (Trustless Agents). The contracts themselves live in the parent repo at [`../contracts`](../contracts).

## Layout

```
apps/web/         SvelteKit 5 frontend (Tailwind, Svelte runes, adapter-cloudflare)
packages/sdk/     @trionlabs/stellar8004 - canonical TS SDK + auto-generated bindings
packages/indexer/ Soroban event indexer that writes to Supabase
packages/db/      Supabase-generated TypeScript types
supabase/         migrations, edge functions (api, indexer, resolve-uris, indexer-health)
docker/           self-hosted Supabase compose (local / self-host)
scripts/          backfill, recover, seed, e2e helpers
```

The single source of truth for contract addresses is
[`packages/sdk/src/core/config.ts`](packages/sdk/src/core/config.ts) - the
indexer, scripts, and frontend env all import from there.

## Run locally

Use Node 22.12+ and the pnpm version pinned in `package.json`.
The x402 payment client requires RPC 25+; the indexer supports RPC 23+.

```bash
pnpm install
pnpm --filter @trionlabs/stellar8004 build   # build SDK once before web
pnpm dev                                   # http://localhost:5173
```

The frontend talks to a Supabase instance for indexed data. For local
development point at the public hosted instance via `apps/web/.env`, or
spin up your own with `docker compose -f docker/docker-compose.supabase.yml up`
(see `docker/.env.example` - replace every `<<REQUIRED>>` value first).

## Tests and checks

```bash
pnpm --filter @trionlabs/stellar8004 test     # SDK unit tests (vitest)
pnpm --filter @stellar8004/indexer test    # indexer + parser tests
pnpm --filter @stellar8004/web test       # payment signing tests
pnpm --filter @stellar8004/web check       # svelte-check + tsc
```

## Deploy

The explorer web app is served from Cloudflare Workers
(`@sveltejs/adapter-cloudflare`; config in `apps/web/wrangler.toml`, published
with `wrangler deploy`). Supabase runs as a hosted project, so the migrations
and Edge Functions (`api`, `indexer`, `resolve-uris`, `indexer-health`) are
deployed to it directly. The `docker/` compose stack is for running the full
Supabase stack self-hosted.

### Indexer migration 050

Migration 050 requires a coordinated database and worker upgrade. It revokes
old direct-write permissions and binds canonical data to the exact network
passphrase and all three registry addresses. Do not apply it to an existing
deployment as an unattended rolling upgrade.

Existing rows lack verified event positions. The migration leaves that
provenance unknown and rejects populated, unbound databases. Before cutover,
complete a source-backed reconstruction in a separate database or an audited
reconciliation using complete verified history. Preserve the current database
and externally exposed response IDs: a fresh rebuild may assign different
arrival-order IDs. Missing historical coverage must remain explicit.

1. Back up the database and retain the old worker artifact and configuration.
   Stop live scheduling, backfills, seed/recovery scripts, and every other
   canonical writer; wait for in-flight work to finish.
2. Apply migrations through 050 to the prepared database. An empty database
   initializes its deployment binding on first acquisition. Verify the exact
   network passphrase and registry addresses before resuming traffic.
3. Regenerate the edge copy with `node scripts/sync-indexer-to-shared.js` and
   verify it with `--check`. Deploy the matching edge worker and historical CLI.
4. Use RPC 23+ and PostgREST 12.2+ with `statement_timeout` and `lock_timeout`
   in `db-hoisted-tx-settings` (the compose stack pins PostgREST 14.6). Direct SQL
   callers must set transaction-local timeouts before invoking the function.
5. Start one live invocation, verify canonical rows, deployment binding,
   `indexer_streams`, mirrored `indexer_state`, gap records, and resolver
   behavior, then resume scheduling.

From `webapp/`, with credentials in the environment:

```sh
BACKFILL_JOB_ID=verified-range DEPLOY_LEDGER=12345 END_LEDGER=23456 \
  pnpm exec tsx scripts/backfill-events.ts
```

`END_LEDGER` is inclusive; if omitted on the first run, that run's head becomes
the fixed target. Resume with the same job, source, and bounds. Exit 0 means
the scan and its final forced leaderboard refresh completed, 75 means resumable
work/contention/cooldown, and 1 means failure. Do not retry in a tight loop.
Changing RPC providers requires verifying source equivalence and resetting
opaque cursors from a proven completed ledger. A new job ID does not bypass
deployment or provenance checks.

Rollback requires stopping writers and restoring compatible database and worker
artifacts together. Older direct-write tools, including recovery and seed
scripts, are rejected after 050. Do not regrant unguarded writes while the new
worker is active.

The PostgreSQL regression harness uses its own temporary cluster with TCP
disabled: `PG_BINDIR=/path/to/postgresql17/bin pnpm --filter @stellar8004/indexer test:db`.
It does not validate a production cutover or historical coverage in your deployment.

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
