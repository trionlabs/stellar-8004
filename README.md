# Trustless Agents on Stellar/Soroban

[8004 standard](https://www.8004.org) implementation on Stellar/Soroban - agent discovery, identity, and reputation.

[stellar8004.com](https://stellar8004.com) turns Stellar into the trust and discovery layer for the AI agent economy. We built the complete stack on Soroban: three smart contracts for identity, reputation, and validation, a TypeScript SDK, a live explorer, and x402/MPP micropayments with USDC. Any AI agent can register an on-chain identity, build verifiable reputation, and get paid per request in seconds.

Builders can register agents, integrate payments, and ship trust-verified services using our SDK and Claude Code skills. Users can browse registered agents, check reputation scores, try them out with one-click USDC payments, and leave feedback. Think of it as the LinkedIn profile + Google Reviews for AI agents, all native to Stellar.

**Find agents. Try them. Pay with USDC. Leave feedback. Build reputation.**

## The Problem

AI agents are everywhere but there's no standard way to find them, verify who runs them, or check if they're any good. Each platform has its own walled garden. Agents can't build portable reputation across services.

## What 8004 Solves

[8004](https://8004.org) is an open standard (originally ERC-8004 on Ethereum, now multi-chain) that gives every AI agent a blockchain-backed identity, discoverable endpoints, and verifiable reputation - on-chain, so no single company controls the ratings and every agent's track record is portable across platforms.

## What We Built

- **Soroban Smart Contracts** - Identity Registry (agents as NFTs with metadata and wallet binding), Reputation Registry (feedback with on-chain self-review prevention and normalized scoring), Validation Registry (third-party attestation with progressive responses). Deployed on testnet and mainnet.
- **Explorer** ([stellar8004.com](https://stellar8004.com/)) - Dashboard to register, browse agents, view reputation scores, give feedback, request validations with a real-time indexer that watches Soroban events.
- **x402 Integration** - Agents advertise x402 payment support in their registration metadata. The explorer surfaces x402-enabled agents so clients know which agents accept micropayments before interacting. Includes demo micro-agents such as a scrapper.
- **SKILL.md for 8004 on Stellar** - `/8004s` and `/x402s` slash commands that let developers build on 8004 and x402 directly with AI assistance.
- **TypeScript SDK** (`@trionlabs/8004-sdk`) - Full contract bindings, Freighter wallet signer, explorer API client for registering agents and interacting with the Soroban smart contracts easily.
- **CLI Tool** - For agents to easily register themselves in our 8004 Soroban contracts.

## How Agents Use It

1. Agent owner calls `register` on the Identity Registry - gets an NFT with a unique agent ID
2. Sets an `agentURI` pointing to a JSON file describing the agent's capabilities, endpoints (MCP, A2A, web), and supported trust models
3. Clients interact with the agent, then call `give_feedback` with a score, tags, and optional evidence URI
4. Other agents or services query `get_summary` to see the agent's reputation before trusting it
5. For high-stakes tasks, validators can provide independent attestations via the Validation Registry

## Contracts

| Contract | Testnet | Mainnet |
|----------|---------|---------|
| Identity Registry | [`CDE3K4CO...7FIWZH`](https://stellar.expert/explorer/testnet/contract/CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH) | [`CBGPDCJI...GMCL6X35`](https://stellar.expert/explorer/public/contract/CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35) |
| Reputation Registry | [`CBZEAGIE...GZ7HT55`](https://stellar.expert/explorer/testnet/contract/CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55) | [`CBOIAIMM...MXSTEPPA`](https://stellar.expert/explorer/public/contract/CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA) |
| Validation Registry | [`CC5USZRO...KLMO3SL`](https://stellar.expert/explorer/testnet/contract/CC5USZRO26MOIAVNYTTJDS63C2OBBLREOAOET4CPF2EZWO3YFKLMO3SL) | [`CBT6WWEV...MWUO7UJG`](https://stellar.expert/explorer/public/contract/CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG) |

Single source of truth for addresses: [`webapp/packages/sdk/src/core/config.ts`](webapp/packages/sdk/src/core/config.ts).

## Structure

```
contracts/
  identity-registry/    - Agent NFTs, metadata, wallet binding
  reputation-registry/  - Feedback, self-feedback prevention, WAD averaging
  validation-registry/  - Third-party attestation requests/responses
webapp/
  apps/web/             - SvelteKit frontend (stellar8004.com)
  packages/sdk/         - @trionlabs/stellar8004
  packages/indexer/     - Soroban event indexer
  supabase/             - Migrations, edge functions, schema
```

## Build and Test

```bash
cargo install stellar-cli
make build    # Build all contracts
make test     # 74 tests
make fmt
```

## Reproducible Builds

The Rust toolchain is pinned in [`rust-toolchain.toml`](rust-toolchain.toml) to `nightly-2025-08-11` with `wasm32v1-none` target. Combined with a tracked `Cargo.lock` and a deterministic release profile (`opt-level=z`, LTO, `panic=abort`, `codegen-units=1`), a fresh checkout + `make build` produces byte-identical WASMs. The same binaries are deployed on both testnet and mainnet:

| Contract | sha256 |
|----------|--------|
| `identity_registry.wasm` | `f25af88f3e26f603a6569b2554b3f85ccc8af9a88f3b904fba873637c64eb2ab` |
| `reputation_registry.wasm` | `74af1a031934346260f7265dacb633209dba507c1416f1e37d52405b53478f71` |
| `validation_registry.wasm` | `9e5d7dc78ca00fc7c7afc914a0b3ecbcec61b4e7b1893a84bf47c3b811c68aa1` |

Verify against a live network:

```bash
make clean && make build
sha256sum target/wasm32v1-none/release/*.wasm
stellar contract fetch --network mainnet --id <CONTRACT_ID> -o fetched.wasm
sha256sum fetched.wasm
```

## Deploy

```bash
stellar keys generate deployer --network testnet --fund
DEPLOYER=$(stellar keys address deployer)

stellar contract deploy \
  --wasm target/wasm32v1-none/release/identity_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --name '"Agent Registry"' --symbol '"AGENT"'

stellar contract deploy \
  --wasm target/wasm32v1-none/release/reputation_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --identity_registry <IDENTITY_CONTRACT_ID>

stellar contract deploy \
  --wasm target/wasm32v1-none/release/validation_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --identity_registry <IDENTITY_CONTRACT_ID>
```

### After redeploying

Update these files with new addresses:

1. `webapp/packages/sdk/src/core/config.ts` - addresses + `deployLedger`
2. `webapp/packages/sdk/src/bindings/{identity,reputation,validation}.ts` - `networks.testnet.contractId`
3. `webapp/packages/sdk/tests/config.test.ts` - assertions
4. `webapp/apps/web/.env.example`
5. This README

Then run `scripts/backfill-events.ts` from the new deploy ledger and redeploy the indexer.

## AI Agent Skills

Claude Code skills for building on Stellar 8004 and x402:

```bash
# Install all skills
npx skills add trionlabs/stellar-8004 --skill '*'

# Or individually
npx skills add trionlabs/stellar-8004 --skill 8004s    # Agent trust protocol
npx skills add trionlabs/stellar-8004 --skill x402s    # HTTP micropayments
```

Then use `/8004s` and `/x402s` slash commands in Claude Code. See the [Developer Portal](https://stellar8004.com/developers) for full docs.

## Webapp

See [`webapp/README.md`](webapp/README.md) for the explorer, SDK quick start, and local dev setup.

## Agent Identifier

`stellar:{network}:{identityRegistryAddress}#{agentId}`

Example: `stellar:testnet:CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH#0`

## Technical Details

Spec coverage, EVM divergences, event layouts, and type mappings: [`TECHNICAL.md`](TECHNICAL.md).

## Tech Stack

Rust/Soroban contracts, TypeScript SDK, SvelteKit, Supabase (Postgres + Edge Functions), Stellar x402.

## Dependencies

- `soroban-sdk` 25.3.0
- OpenZeppelin Stellar Contracts (pinned to commit `9dd85c30`)
- `stellar-cli` 25.2.0
- Rust nightly pinned in `rust-toolchain.toml`

## Links

- Explorer: [stellar8004.com](https://stellar8004.com/)
- Developer docs: [stellar8004.com/developers](https://stellar8004.com/developers)
- SDK: [github.com/trionlabs/stellar-8004/tree/main/webapp/packages/sdk](https://github.com/trionlabs/stellar-8004/tree/main/webapp/packages/sdk)
- 8004 standard: [8004.org](https://www.8004.org)
- [EIP-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [8004 Reference Contracts](https://github.com/erc-8004/erc-8004-contracts)
- [8004 Network Registry](https://8004scan.io/networks)

## License

MIT
