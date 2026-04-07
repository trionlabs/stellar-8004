# Trustless Agents on Stellar/Soroban

Implementation of the [8004 standard](https://www.8004.org) (Trustless Agents) on Stellar/Soroban.

The 8004 standard enables agent discovery, portable identity, and verifiable reputation. It's originally specified as [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) on Ethereum and this is the Stellar implementation.

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
  reputation-registry/  - Feedback storage with running aggregates
  validation-registry/  - Third-party attestation requests/responses
webapp/
  apps/web/             - SvelteKit frontend for stellar8004.com
  packages/sdk/         - @trionlabs/8004-sdk (TS SDK, canonical)
  packages/indexer/     - Soroban event indexer (Supabase Edge Function)
  packages/db/          - Supabase generated types
  supabase/             - Migrations, functions, schema
```

**Identity Registry** - Agents are registered as NFTs with sequential IDs. Supports metadata key-value storage, agent URI, and operational wallet management. Wallet is cleared on transfer to prevent persistence to new owners.

**Reputation Registry** - Feedback from any address (except agent owner/operators). Stores value, decimals, and two filter tags on-chain. Endpoint, URI, and hash are emitted as events only (matching the spec's off-chain indexing design). Running aggregates enable O(1) summary queries.

**Validation Registry** (draft) - Agent owners request validation from specific validators. Designated validators respond with a 0-100 score. Supports summary aggregation and pagination. Based on the current draft spec - the community is still finalizing the design.

Cross-contract calls: Reputation and Validation registries call the Identity Registry via `#[contractclient]` to verify agent ownership for access control and self-feedback prevention.

## Build and Test

Requires Rust nightly and the `stellar` CLI.

```bash
# Install stellar CLI
cargo install stellar-cli

# Build all contracts to WASM (identity first - others depend on it)
make build

# Run all tests (42 tests: unit + integration + negative)
make test

# Run a single contract's tests
make test-identity
make test-reputation
make test-validation

# Format
make fmt
```

Single test: `cargo test --package identity-registry test_register`

## Deploy

```bash
# Generate a funded testnet key
stellar keys generate deployer --network testnet --fund

DEPLOYER=$(stellar keys address deployer)

# Deploy identity registry
stellar contract deploy \
  --wasm target/wasm32v1-none/release/identity_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --name '"Agent Registry"' --symbol '"AGENT"'

# Deploy reputation registry (pass identity registry contract ID)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/reputation_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --identity_registry <IDENTITY_CONTRACT_ID>

# Deploy validation registry
stellar contract deploy \
  --wasm target/wasm32v1-none/release/validation_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --identity_registry <IDENTITY_CONTRACT_ID>
```

## Webapp and SDK

The [stellar8004.com](https://stellar8004.com) explorer, the Soroban event indexer, the self-hosted Supabase stack, and the `@trionlabs/8004-sdk` TypeScript SDK live under [`webapp/`](webapp/). See [`webapp/README.md`](webapp/README.md) for layout, local-dev instructions, and SDK quick start.

## Spec Coverage

Comparison against the canonical reference at [`ChaosChain/trustless-agents-erc-ri`](https://github.com/ChaosChain/trustless-agents-erc-ri) (Jan 2026 update). Function counts are based on the public interfaces in `src/interfaces/`.

| Registry | Spec Functions | Implemented | Partial / Missing |
|----------|----------------|-------------|-------------------|
| Identity | 11 | 11 | - |
| Reputation | 10 | 9 (+1 in SDK) | `getResponseCount` partial (no `responders[]` filter); `readAllFeedback` in SDK |
| Validation | 9 | 8 | `getRequest` missing (would require storing `requestURI` on-chain) |

Plus Soroban-only additions: `extend_ttl`, `upgrade`, `version`, `find_owner` on each contract; `agent_exists` on identity for cross-contract use.

## Differences from the EVM Reference

Soroban is not EVM-compatible. Below is the full delta against the canonical reference impl, separated into intentional design choices, naming differences, and known partials.

**Architecture choices (intentional):**

- `setAgentWallet` uses Soroban's native `require_auth()` on both caller and new wallet instead of EIP-712 / ERC-1271 signatures. Simpler, handles replay protection and domain separation natively. Smart-wallet contracts must implement `__check_auth` (Stellar's equivalent of ERC-1271). The trade-off: no offline pre-signed binding flow - both wallets must sign in the same transaction envelope.
- `getClients`, `getAgentValidations`, `getValidatorRequests` are paginated as `*_paginated(start, limit)`. Soroban has a per-transaction read limit (~100 entries), so unbounded array returns are not possible.
- `readAllFeedback` moved to TypeScript SDK. Iterating all feedback on-chain would exceed Soroban resource limits for any agent with significant history.
- `getSummary` accepts an empty `clientAddresses` array as a shortcut for the agent-wide pre-computed aggregate. The spec requires non-empty; we are more permissive.
- `getSummary` with an explicit client list is hard-capped at 5 clients (`MAX_SUMMARY_CLIENTS`). Soroban's per-tx storage read budget would otherwise blow up on larger lists.
- Three named registers (`register`, `register_with_uri`, `register_full`) instead of Solidity overloading - Soroban has no overloading.
- Wallet AND all metadata cleared on NFT transfer via `ContractOverrides` trait. The spec only mandates clearing the `agentWallet` reserved key; we go further by clearing the full metadata set, since metadata represents claims authored by the previous owner.
- `appendResponse` matches the Jan 2026 spec: callable by anyone, no owner-only restriction. Off-chain consumers filter responses by responder identity.
- `validationResponse` matches the Jan 2026 spec: callable multiple times per `requestHash` for progressive states. Only the original validator can update.

**Storage optimizations:**

- Running aggregates for `getSummary` - updated on each `giveFeedback`/`revokeFeedback` call, enabling O(1) summary queries instead of iterating all entries. Backed by `checked_add` / `checked_sub` so a malicious `i128::MAX` feedback cannot wrap and poison the running total.
- Indexed storage pattern (count + per-index entries) instead of growing `Vec` / `Map`. Soroban docs warn against unbounded collections in storage.
- Per-agent metadata key index so `extend_agent_ttl` can iterate every metadata entry tied to an agent and so `transfer` / `transfer_from` can clear them. Capped at 100 keys per agent.
- On-chain / off-chain data split matches spec: `value`, `valueDecimals`, `tag1`, `tag2`, `isRevoked` are stored. `endpoint`, `feedbackURI`, `feedbackHash`, `responseURI`, `responseHash` are emitted as events only.
- TTL extension on every persistent read and every persistent write across all three contracts. Soroban entries archive after their TTL expires; without read-path bumps the entries silently disappear.

**Type adaptations:**

- `u8` fields changed to `u32` - Soroban's `#[contracttype]` does not support `u8`. Affects `valueDecimals`, `response`.
- `uint256` agent IDs changed to `u32` - OZ Stellar NFT uses `u32` token IDs. Supports ~4 billion agents.
- `int128` value field stays as `i128` - i128 is supported natively by Soroban.
- `uint64 feedbackIndex` stays as `u64`.
- `uint256 lastUpdate` changed to `u64` - we use ledger sequence (`u32` would also work; `u64` gives headroom).
- `address` maps to Soroban `Address` (covers both Stellar accounts and Soroban contract accounts via the same type).
- `MetadataEntry` field names are `key` / `value` (Rust convention) instead of the spec's `metadataKey` / `metadataValue`. The XDR encoding differs; cross-chain interop tooling should translate.

**Naming differences:**

- All function names are snake_case (`set_agent_uri`, `give_feedback`, `validation_request`) per Rust convention; spec uses camelCase.
- Wallet events are split into `AgentWalletSet { agent_id, new_wallet, set_by }` (set/update) and `AgentWalletUnset { agent_id, set_by }` (unset). The spec uses a single `AgentWalletSet` event with `address(0)` as the unset sentinel; Soroban has no zero-address sentinel so the unset case is its own event. Cross-chain subscribers reading the spec event need to also listen for `AgentWalletUnset`.
- `MetadataEntry` field names use `key`, `value` instead of spec's `metadataKey`, `metadataValue`.
- Soroban events emit each indexed string field once with the literal value as a topic. Solidity events emit indexed string fields twice (once as `keccak256` topic, once as the literal data). For our `MetadataSet`, `NewFeedback.tag1` etc., the topic is the unhashed Soroban string - more direct for Soroban subscribers but structurally different from the spec's hashed-topic + literal-data pattern.

**Partial coverage:**

- `getResponseCount` does not accept a `responders[]` filter argument. We track only the response count per `(agent_id, client, feedback_index)`, not per-responder identity. The spec's filtered variant would require new per-responder storage. Off-chain consumers can compute the filtered count from `ResponseAppended` events (`responder` is an indexed topic).
- `getRequest(requestHash)` is not implemented. The spec function returns `(validatorAddress, agentId, requestURI, timestamp)` - we don't store `requestURI` on-chain (it's only emitted in the `ValidationRequest` event). Implementing this would require adding `request_uri` to the persistent `ValidationStatus` struct.

**Soroban-specific additions:**

- `extend_ttl()` on all contracts - Soroban persistent storage requires periodic TTL renewal or data archives.
- `upgrade()` with `#[only_owner]` on all contracts - native contract upgrades.
- `version()` on all contracts - on-chain version query.
- `contractmeta!` binary metadata for WASM version tracking.
- `find_owner()` on Identity Registry - non-panicking variant of `owner_of`. Cross-contract callers (Reputation, Validation) use this to surface a clean `AgentNotFound` error instead of crashing on an archived NFT entry.
- `agent_exists()` on Identity Registry - boolean variant of `find_owner` matching the spec's `agentExists()` name. Used by cross-contract precondition checks.
- `total_agents()` on Identity Registry - matches the spec function. Backed by the OZ NFT sequential token id counter.
- `request_exists()` on Validation Registry - matches the spec function. Wraps the internal storage existence check.
- Reserved `agentWallet` metadata key is enforced: `set_metadata` and `register_full` reject this key, matching the spec requirement that wallet bindings flow through `set_agent_wallet` only.
- Empty key / URI rejection on `set_metadata`, `set_agent_uri`, `append_response`, matching the reference impl's `require(bytes(...).length > 0)` checks.
- Per-entry size caps on metadata: 64-byte keys, 4096-byte values, 100 keys per agent. Bounds storage growth for the metadata API.

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
- [8004 Network Registry](https://8004scan.io/networks)
- [EVM Reference Contracts](https://github.com/erc-8004/erc-8004-contracts)
- [Best Practices](https://github.com/erc-8004/best-practices)

## License

MIT
