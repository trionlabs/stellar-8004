# Trustless Agents on Stellar/Soroban

[8004 standard](https://www.8004.org) implementation on Stellar/Soroban - agent discovery, identity, and reputation.

The 8004 stack on Soroban: three smart contracts for identity, reputation, and validation, a TypeScript SDK, a live explorer at [stellar8004.com](https://stellar8004.com), and x402/MPP micropayments with USDC. Agents can register an on-chain identity, build verifiable reputation, and get paid per request.

The explorer at [stellar8004.com](https://stellar8004.com) serves both builders and users. Builders register agents, integrate payments, and build trust-verified services using the SDK and developer documentation. Users browse agents, check reputation scores, try them with USDC payments, and leave feedback.

## What 8004 Solves

[8004](https://8004.org) is an open standard (originally ERC-8004 on Ethereum, now multi-chain) that gives every AI agent a blockchain-backed identity, discoverable endpoints, and verifiable reputation - on-chain, so no single company controls the ratings and every agent's track record is portable across platforms.

## What We Built

- **Soroban Smart Contracts** - Identity Registry (agents as NFTs with metadata and wallet binding), Reputation Registry (feedback with on-chain self-review prevention and normalized scoring), Validation Registry (third-party attestation with progressive responses). Deployed on testnet and mainnet.
- **Explorer** ([stellar8004.com](https://stellar8004.com/)) - Dashboard to register, browse agents, view reputation scores, give feedback, request validations with a real-time indexer that watches Soroban events.
- **x402 and MPP Integration** - Agents advertise x402 and Managed Payment Protocol support in their registration metadata. The explorer surfaces payment-enabled agents so clients know which agents accept micropayments before interacting. Includes demo micro-agents such as a scrapper.
- **TypeScript SDK** (`@trionlabs/stellar8004`) - Contract bindings, Freighter wallet signer, and explorer API client for registering agents and interacting with the Soroban smart contracts.

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
cargo install --locked stellar-cli --version 25.2.0
make build    # Build all contracts using the local host toolchain
make test     # 74 tests
make fmt
```

## Reproducible Builds

Run `make verify-wasm` with Docker running. Local verification and CI both use
[`scripts/verify-wasm.sh`](scripts/verify-wasm.sh), which pins the official Stellar
CLI 25.2.0 image by its Linux/amd64 digest and explicitly selects
`nightly-2025-08-11` with the `wasm32v1-none` target. It builds with the tracked
`Cargo.lock` and release profile, checks all three digests in
[`contracts/wasm.sha256`](contracts/wasm.sha256), and copies successful outputs to
`target/reproducible/`. The source mount is read-only; native build outputs stay
in `target/wasm32v1-none/release/`.

The build host is part of this recipe. Native macOS/arm64 and Linux/x86_64 builds
with the same Rust and CLI versions assign different internal function indices
in reputation and validation. Comparing their WASM instructions after remapping
those indices confirms identical behavior and contract interfaces, but their
file hashes differ. The manifest records the canonical Linux build. Ordinary
`make build` remains available for local development.

The previously recorded deployment digests below match the native macOS layout
with CLI metadata `25.2.0#`, without a revision. Current CLI 25.2.0 packages embed
revision `28484880988199233a7e8e87c97cb12dac323cb3`; the canonical Linux build also
has the function ordering described above. Keep these deployment digests
separate from the current reproducible-build manifest:

| Contract | sha256 |
|----------|--------|
| `identity_registry.wasm` | `f25af88f3e26f603a6569b2554b3f85ccc8af9a88f3b904fba873637c64eb2ab` |
| `reputation_registry.wasm` | `74af1a031934346260f7265dacb633209dba507c1416f1e37d52405b53478f71` |
| `validation_registry.wasm` | `9e5d7dc78ca00fc7c7afc914a0b3ecbcec61b4e7b1893a84bf47c3b811c68aa1` |

Fetch an existing deployment to compare with its recorded digest:

```bash
stellar contract fetch --network mainnet --id <CONTRACT_ID> -o fetched.wasm
sha256sum fetched.wasm
```

## Deploy

First run `make verify-wasm` successfully for the source you intend to deploy.
If verification fails, stop: `target/reproducible/` may still contain artifacts
from an earlier successful build.

```bash
stellar keys generate deployer --network testnet --fund
DEPLOYER=$(stellar keys address deployer)

stellar contract deploy \
  --wasm target/reproducible/identity_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --name '"Agent Registry"' --symbol '"AGENT"'

stellar contract deploy \
  --wasm target/reproducible/reputation_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --identity_registry <IDENTITY_CONTRACT_ID>

stellar contract deploy \
  --wasm target/reproducible/validation_registry.wasm \
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

Preserve the existing indexed database and prepare a separately verified
projection for the new registry deployment. Agent IDs can repeat across
deployments, and migration 050 binds one database to its exact network and
registry addresses. Follow the coordinated upgrade and historical backfill
instructions in [the webapp guide](webapp/README.md#indexer-migration-050).

## Webapp

See [`webapp/README.md`](webapp/README.md) for the explorer, SDK quick start, and local dev setup.

## Agent Identifier

`stellar:{network}:{identityRegistryAddress}#{agentId}`

Example: `stellar:testnet:CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH#0`

> **On `{network}`:** the identifier uses the friendly labels `testnet` and `mainnet`. These are human-readable display labels, **not** strict [CAIP-2](https://chainagnostic.org/CAIPs/caip-2) chain ids — the CAIP-2 chain id for Stellar mainnet is `stellar:pubnet`. The x402/MPP payment layer uses the CAIP-2 form (`stellar:pubnet` / `stellar:testnet`); the agent identifier above intentionally keeps the `mainnet` label for continuity.

## Technical Details

Contract interfaces are in [`contracts/`](contracts/); TypeScript bindings and
usage examples are in [the SDK guide](webapp/packages/sdk/README.md).

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
