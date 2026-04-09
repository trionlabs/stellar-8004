# Trustless Agents on Stellar/Soroban

Implementation of the [8004 standard](https://www.8004.org) on Stellar/Soroban. The standard enables agent discovery, portable identity, and verifiable reputation across chains. Originally specified as [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) on Ethereum - this is the Stellar implementation.

Note: The Identity and Reputation registries are stable and deployed across EVM chains. The Validation Registry is still under active community discussion and not yet deployed in the ecosystem. Our implementation follows the current draft spec and may need updates when the design is finalized.

## Deployed Contracts

The canonical source of truth for these addresses is `webapp/packages/sdk/src/core/config.ts` (`TESTNET_CONFIG`, `MAINNET_CONFIG`). Every other consumer (indexer, frontend env, scripts) imports from there.

### Testnet

| Contract | Address |
|----------|---------|
| Identity Registry | [`CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ`](https://stellar.expert/explorer/testnet/contract/CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ) |
| Reputation Registry | [`CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4`](https://stellar.expert/explorer/testnet/contract/CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4) |
| Validation Registry | [`CA6GIV7QB4B3O5SBZZRL3E3XMFFECGRETSN4JXAYTFKF5HUTD4JY2SJQ`](https://stellar.expert/explorer/testnet/contract/CA6GIV7QB4B3O5SBZZRL3E3XMFFECGRETSN4JXAYTFKF5HUTD4JY2SJQ) |

### Mainnet

| Contract | Address |
|----------|---------|
| Identity Registry | [`CCSMX3YEKU7IZCZSLORUCX6MQEOV6WXWAGTOJZG5YITEBAEH2Q5JY4XE`](https://stellar.expert/explorer/public/contract/CCSMX3YEKU7IZCZSLORUCX6MQEOV6WXWAGTOJZG5YITEBAEH2Q5JY4XE) |
| Reputation Registry | [`CCIZJXEVL2DJXH772F7SX262M5SF7JNOIAROW2M7I6VTPOVCJ7KKM5HT`](https://stellar.expert/explorer/public/contract/CCIZJXEVL2DJXH772F7SX262M5SF7JNOIAROW2M7I6VTPOVCJ7KKM5HT) |
| Validation Registry | [`CAI3ZKBNXC52F2DCEX2XQLXUTRAQKCPWUUXDELW5SPAF4GAW4HCQ4JT3`](https://stellar.expert/explorer/public/contract/CAI3ZKBNXC52F2DCEX2XQLXUTRAQKCPWUUXDELW5SPAF4GAW4HCQ4JT3) |

## Architecture

Three independent Soroban contracts in a Cargo workspace, plus the webapp monorepo:

```
contracts/
  identity-registry/    - Agent registration as NFTs (OZ NonFungibleToken)
  reputation-registry/  - Feedback with WAD-normalized averaging
  validation-registry/  - Third-party attestation requests/responses
webapp/
  apps/web/             - SvelteKit frontend for stellar8004.com
  packages/sdk/         - @trionlabs/8004-sdk (TS SDK, canonical)
  packages/indexer/     - Soroban event indexer (Supabase Edge Function)
  packages/db/          - Supabase generated types
  supabase/             - Migrations, functions, schema
```

**Identity Registry** - Agents are registered as NFTs with sequential IDs. Supports metadata key-value storage, agent URI, and operational wallet. The `agentWallet` metadata key is initialized to caller on register, exposed via `get_metadata`, and flows through `MetadataSet` events (no dedicated wallet event). Wallet and all metadata are cleared on transfer.

**Reputation Registry** - Feedback from any address except the agent owner or approved operators (on-chain self-feedback prevention via `is_authorized_or_owner`). Stores value, decimals, and two filter tags on-chain. Endpoint, URI, and hash are event-only. `get_summary` returns the WAD-normalized average over an explicit client list (empty list reverts).

**Validation Registry** (draft) - Agent owners request validation from specific validators. Validators respond with a 0-100 score and may issue progressive updates. Based on the current draft spec.

## Build and Test

Requires Rust nightly and the `stellar` CLI.

```bash
cargo install stellar-cli

make build    # Build all contracts to WASM
make test     # Run all 72 tests (unit + integration + negative)
make fmt      # Format
```

Single test: `cargo test --package identity-registry test_register`

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

## Webapp and SDK

The [stellar8004.com](https://stellar8004.com) explorer, the Soroban event indexer, the self-hosted Supabase stack, and the `@trionlabs/8004-sdk` TypeScript SDK live under [`webapp/`](webapp/). See [`webapp/README.md`](webapp/README.md) for layout, local-dev instructions, and SDK quick start.

## Spec Coverage

Compared against the [8004 reference contracts](https://github.com/erc-8004/erc-8004-contracts) (`master`, 2026-04-08).

| Registry | Spec Functions | Implemented | Partial / Missing |
|----------|----------------|-------------|-------------------|
| Identity | 11 | All 11 | - |
| Reputation | 10 | 8 | `readAllFeedback` off-chain only (explorer HTTP endpoint). `getResponseCount` no `responders[]` filter. `getClients` paginated. |
| Validation | 7 | All 7 | `getAgentValidations` and `getValidatorRequests` paginated. |

Soroban-only additions: `extend_ttl`, `propose_upgrade` / `execute_upgrade` / `cancel_upgrade` / `pending_upgrade` (3-day timelocked upgrades), `version`, `find_owner`, `agent_exists`, `total_agents`, `request_exists`, `token_uri` override, metadata size caps (64B key / 4KB value / 100 keys). OZ 2-step ownership exposed: `get_owner`, `transfer_ownership`, `accept_ownership`, `renounce_ownership`.

## Differences from the EVM Reference

All 8004 spec functions are implemented with equivalent behavior. The differences below are inherent to the Soroban runtime or are intentional security hardening.

**Runtime constraints:**

| What | EVM | Soroban |
|------|-----|---------|
| `setAgentWallet` auth | EIP-712 / ERC-1271 signature + deadline | `require_auth()` on both caller and wallet (native, no replay) |
| `getClients` / `getAgentValidations` / `getValidatorRequests` | Returns full array | Paginated `*_paginated(start, limit)` (per-tx read budget ~100 entries) |
| `readAllFeedback` | On-chain, returns 7 parallel arrays | Off-chain: explorer HTTP `/api/v1/agents/:id/feedback` wrapped by SDK `ExplorerClient.getFeedback()` |
| `getSummary` client cap | Unbounded | Hard-capped at 5 clients per call |
| Function overloading | `register()`, `register(uri)`, `register(uri, metadata)` | Three named functions: `register`, `register_with_uri`, `register_full` |
| `getResponseCount` | Accepts `responders[]` filter | Total count only; per-responder filtering via `ResponseAppended` events |

**Security hardening (stricter than spec):**

- Transfer clears ALL metadata (spec only clears `agentWallet`). Prevents a previous owner's claims (e.g. `verified=true`) from persisting to new owner.
- Metadata size caps: 64-byte keys, 4KB values, 100 keys per agent. Soroban storage is rented; without caps an agent can spam unbounded keys.

**Type adaptations:**

| Spec type | Soroban type | Notes |
|-----------|-------------|-------|
| `uint8` | `u32` | Soroban `#[contracttype]` has no `u8` |
| `uint256 agentId` | `u32` | OZ Stellar NFT uses u32 (~4B agents) |
| `int128 value` | `i128` | Native |
| `uint64 feedbackIndex` | `u64` | Native |
| `uint256 lastUpdate` | `u64` | Ledger sequence |
| `address` | `Address` | Covers both G-accounts and C-contracts |
| `abi.encodePacked(address)` | StrKey ASCII (56 bytes) | `agentWallet` metadata encoding |
| `int256` WAD intermediate | `i128` | Overflow at `\|value\| > ~1.7e20` with `decimals=0`; returns `AggregateOverflow` cleanly |

**Naming:** All functions are snake_case per Rust convention. Event indexed string topics are literal Soroban strings (not keccak256 hashes as in Solidity).

**Event topic positions:**

| Event | Topics | Body |
|-------|--------|------|
| `Registered` | `agent_id`, `owner` | `agent_uri` |
| `UriUpdated` | `agent_id`, `updated_by` | `new_uri` |
| `MetadataSet` | `agent_id`, `key` | `value` (wallet writes use `key="agentWallet"`) |
| `NewFeedback` | `agent_id`, `client_address`, `tag1` | remaining fields |
| `FeedbackRevoked` | `agent_id`, `client_address`, `feedback_index` | empty |
| `ResponseAppended` | `agent_id`, `client_address`, `responder` | remaining fields |
| `ValidationRequest` | `validator_address`, `agent_id`, `request_hash` | `request_uri` |
| `ValidationResponse` | `validator_address`, `agent_id`, `request_hash` | remaining fields |

## Global Agent Identifier

Format: `stellar:{network}:{identityRegistryAddress}#{agentId}`

Example: `stellar:testnet:CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ#0`

## Dependencies

- `soroban-sdk` 25.3.0
- OpenZeppelin Stellar Contracts (pinned to commit `9dd85c30`) - NFT, access control, macros
- `stellar-cli` 25.2.0

## References

- [8004 Standard](https://www.8004.org)
- [EIP-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [8004 Reference Contracts](https://github.com/erc-8004/erc-8004-contracts)
- [8004 Network Registry](https://8004scan.io/networks)
- [Best Practices](https://github.com/erc-8004/best-practices)

## License

MIT
