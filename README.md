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

**Identity Registry** - Agents are registered as NFTs with sequential IDs. Supports metadata key-value storage, agent URI, and operational wallet management. The reserved `agentWallet` metadata key is initialized to the caller on `register*`, exposed via `getMetadata(agentId, "agentWallet")`, and emitted as a `MetadataSet` event on every wallet write (matching the canonical erc-8004 reference, which has no dedicated wallet event). Wallet AND all metadata are cleared on transfer to prevent claims authored by the previous owner from persisting.

**Reputation Registry** - Feedback from any address EXCEPT the agent owner or any approved operator. Self-feedback prevention runs on-chain via the identity registry's `is_authorized_or_owner` cross-contract view. Stores value, decimals, and two filter tags on-chain. Endpoint, URI, and hash are emitted as events only (matching the spec's off-chain indexing design). `get_summary` returns the WAD-normalized average over an explicit client list and reverts on an empty client list - the canonical reference rejects all-clients aggregates as a Sybil/spam vector.

**Validation Registry** (draft) - Agent owners request validation from specific validators. Designated validators respond with a 0-100 score, and may issue progressive responses (multiple `validation_response` calls per `request_hash`). Supports summary aggregation and pagination. Based on the current draft spec - the community is still finalizing the design.

Cross-contract calls: Reputation and Validation registries call the Identity Registry via `#[contractclient]` to verify agent ownership. The reputation registry uses the spec's `isAuthorizedOrOwner` interface for self-feedback prevention; the validation registry calls `find_owner` directly.

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

Comparison against the canonical reference at [`erc-8004/erc-8004-contracts`](https://github.com/erc-8004/erc-8004-contracts) (`master`, last refreshed 2026-04-08). Function counts are taken from the public surface of `IdentityRegistryUpgradeable.sol`, `ReputationRegistryUpgradeable.sol`, and `ValidationRegistryUpgradeable.sol`.

| Registry | Spec Functions | Implemented | Partial / Missing |
|----------|----------------|-------------|-------------------|
| Identity | `register`, `register(uri)`, `register(uri, metadata)`, `setAgentURI`, `getMetadata`, `setMetadata`, `setAgentWallet`, `getAgentWallet`, `unsetAgentWallet`, `tokenURI`, `isAuthorizedOrOwner` | All 11 | - |
| Reputation | `giveFeedback`, `revokeFeedback`, `appendResponse`, `readFeedback`, `getSummary`, `readAllFeedback`, `getResponseCount`, `getClients`, `getLastIndex`, `getIdentityRegistry` | 8 | `readAllFeedback` not on-chain (paginated explorer HTTP endpoint instead). `getResponseCount` does not accept a `responders[]` filter. `getClients` is paginated. |
| Validation | `validationRequest`, `validationResponse`, `getValidationStatus`, `getSummary`, `getAgentValidations`, `getValidatorRequests`, `getIdentityRegistry` | All 7 | `getAgentValidations` and `getValidatorRequests` are paginated. |

Plus Soroban-only additions: `extend_ttl`, `upgrade`, `version`, `find_owner` on each contract; `agent_exists`, `total_agents` on identity; `request_exists` on validation. The identity registry also overrides `token_uri` so the inherited `IERC721Metadata.tokenURI(agentId)` returns the agent's URI instead of the OZ default `base_uri + token_id` (which is empty for us).

## Differences from the EVM Reference

Soroban is not EVM-compatible. Below is the full delta against the canonical reference impl, separated into spec-equivalent behavior, intentional architectural divergences, naming differences, and known partials.

**Spec-equivalent behavior** (the canonical reference's contract surface, faithfully translated to Soroban):

- `register`, `register_with_uri`, `register_full` all initialize the reserved `agentWallet` metadata key to the caller's address and emit a corresponding `MetadataSet` event - matching the canonical reference where `register*` always seeds `_metadata[agentId]["agentWallet"] = msg.sender`.
- `set_agent_wallet` writes through to the same wallet slot and emits `MetadataSet` for the `agentWallet` key; `unset_agent_wallet` writes empty bytes; the transfer override clears the slot and emits `MetadataSet` with empty bytes. There is no dedicated wallet event - all wallet writes flow through `MetadataSet`, exactly as in the reference.
- `get_metadata(agentId, "agentWallet")` returns the wallet bytes (the StrKey ASCII representation of the address), so the spec view contract holds even though the wallet is stored in a typed `Address` slot under the hood.
- `is_authorized_or_owner(spender, agent_id) -> bool` on the identity registry mirrors the reference's `isAuthorizedOrOwner` view. The reputation registry calls THIS single view for self-feedback prevention.
- `give_feedback` REJECTS the agent owner and any approved operator on-chain, matching the canonical reference's `require(!isAuthorizedOrOwner(...), "Self-feedback not allowed")`. The error code is `SelfFeedback = 1`.
- `give_feedback` enforces `value_decimals <= 18` and `value in [-1e38, 1e38]` (`MAX_ABS_VALUE`), matching the reference's two require statements.
- `get_summary` returns the WAD-normalized average over the matched feedback, then scales the result back to the most-frequent (mode) `valueDecimals` - the same algorithm the reference uses. It REVERTS with `ClientAddressesRequired` on an empty client list, matching the reference's `revert("clientAddresses required")`. The all-clients aggregate path is removed because it is a Sybil/spam vector explicitly called out by the spec.
- `append_response` is callable by ANYONE - no owner/operator restriction. Multiple responses per `(agent, client, feedback, responder)` are accepted (the per-responder count increments). Empty `response_uri` is rejected with `EmptyValue`, mirroring `require(bytes(responseURI).length > 0)`.
- `validation_response` accepts multiple calls per `request_hash` (progressive validation states like soft/hard finality). The reserved `AlreadyResponded = 6` error code is retained for binding ABI stability but is never raised - matches the reference's design.

**Intentional Soroban-specific divergences:**

- `setAgentWallet` uses Soroban's native `require_auth()` on both the caller and the new wallet instead of the spec's EIP-712 / ERC-1271 signature with deadline. Soroban auth entries are scoped to a single transaction so anti-replay is automatic. Smart-wallet contracts must implement `__check_auth` (Stellar's ERC-1271 equivalent). Trade-off: no offline pre-signed binding flow - both wallets must sign in the same transaction envelope.
- `getClients`, `getAgentValidations`, `getValidatorRequests` are paginated as `*_paginated(start, limit)`. Soroban has a per-transaction read limit (~100 entries) and these list functions can grow unbounded; the spec returns the full list in one call.
- `readAllFeedback` is not implemented on-chain. Iterating every feedback row would exceed Soroban resource limits for any agent with significant history. The explorer indexer's `/api/v1/agents/:id/feedback` HTTP endpoint covers the same use case off-chain (paginated, tag-filterable) and is wrapped by `ExplorerClient.getFeedback()` in the TypeScript SDK.
- `get_summary` with an explicit client list is hard-capped at 5 clients (`MAX_SUMMARY_CLIENTS`). Soroban's per-tx storage read budget would otherwise blow up on larger lists.
- Three named registers (`register`, `register_with_uri`, `register_full`) instead of Solidity overloading - Soroban has no overloading.
- Wallet AND all metadata cleared on NFT transfer via `ContractOverrides` trait. The spec only mandates clearing the `agentWallet` reserved key; we go further by clearing the full metadata set, since metadata represents claims authored by the previous owner. **Off-chain consumers reading our events see a `MetadataSet` with empty bytes for the `agentWallet` key on every transfer (matching the reference) AND see all other metadata keys disappear (a stricter security posture).**
- The reputation registry has NO running aggregate storage. The reference also computes `getSummary` on demand (within the constraint that `clientAddresses` is non-empty). Aggregates were a non-spec extension we removed when we restored spec parity.
- The validation registry computes `get_summary` on demand and uses the same integer division as the reference (`average_response = total / count`). Callers wanting fractional precision should compute the average off-chain from the raw responses.

**Type adaptations:**

- `u8` fields changed to `u32` - Soroban's `#[contracttype]` does not support `u8`. Affects `valueDecimals`, `response`.
- `uint256` agent IDs changed to `u32` - OZ Stellar NFT uses `u32` token IDs. Supports ~4 billion agents.
- `int128 value` stays as `i128` - i128 is supported natively by Soroban.
- `uint64 feedbackIndex` stays as `u64`.
- `uint256 lastUpdate` changed to `u64` - we use ledger sequence (`u32` would also work; `u64` gives headroom).
- `address` maps to Soroban `Address` (covers both Stellar accounts and Soroban contract accounts via the same type).
- `agentWallet` metadata value is the StrKey ASCII representation of the address (56 bytes). The reference uses `abi.encodePacked(address)` (20 bytes). Cross-chain consumers can decode either with the appropriate Stellar / Ethereum address library.
- `MetadataEntry` field names are `key` / `value` (Rust convention) instead of the spec's `metadataKey` / `metadataValue`.
- `getSummary` WAD normalization uses `i128` for intermediate arithmetic. The canonical reference uses Solidity's `int256` which can hold `1e38 * 1e18 = 1e56`. In `i128` (max ~1.7e38), the `value * 10^(18-decimals)` multiply overflows for `|value| > ~1.7e20` at `decimals=0`. The checked multiply returns `AggregateOverflow` cleanly (no silent corruption). Realistic feedback values (quality ratings, uptimes, revenues) are well within the safe range. Callers with extreme values should use higher `valueDecimals` to reduce the normalization factor.

**Naming differences:**

- All function names are snake_case (`set_agent_uri`, `give_feedback`, `validation_request`) per Rust convention; spec uses camelCase.
- Validation events use the spec names `ValidationRequest` / `ValidationResponse`.
- Soroban events emit each indexed string field once with the literal value as a topic. Solidity events emit indexed string fields twice (once as `keccak256` topic, once as the literal data). For our `MetadataSet`, `NewFeedback.tag1` etc., the topic is the unhashed Soroban string - more direct for Soroban subscribers but structurally different from the spec's hashed-topic + literal-data pattern.

**Event topic alignment:**

Indexed fields appear in the topic array (positions 1..n), not the data body. Off-chain parsers must read from these positions:

- `Registered`: `agent_id` (1), `owner` (2). `agent_uri` in body.
- `UriUpdated`: `agent_id` (1), `updated_by` (2). `new_uri` in body.
- `MetadataSet`: `agent_id` (1), `key` (2). `value` in body. Wallet writes flow through this event with `key="agentWallet"` and the StrKey-encoded address bytes (or empty bytes on unset / transfer).
- `NewFeedback`: `agent_id` (1), `client_address` (2), `tag1` (3). Remaining fields in body.
- `FeedbackRevoked`: `agent_id` (1), `client_address` (2), `feedback_index` (3). Empty body.
- `ResponseAppended`: `agent_id` (1), `client_address` (2), `responder` (3). Remaining fields in body.
- `ValidationRequest`: `validator_address` (1), `agent_id` (2), `request_hash` (3). `request_uri` in body.
- `ValidationResponse`: `validator_address` (1), `agent_id` (2), `request_hash` (3). Remaining fields in body.

The `webapp/packages/indexer` parsers and `scripts/backfill-events.ts` are updated for this layout. The indexer parser also promotes a `metadata_set` event with `key="agentWallet"` to a typed `AgentWalletSet` (or `AgentWalletUnset` for empty bytes) before reaching the DB writer, so the `agents.wallet` column gets a clean update path.

**Partial coverage:**

- `getResponseCount` does not accept a `responders[]` filter argument. We track only the response count per `(agent_id, client, feedback_index)`, not per-responder identity. The spec's filtered variant would require new per-responder storage. Off-chain consumers can compute the filtered count from `ResponseAppended` events (`responder` is an indexed topic).

**Soroban-specific additions:**

- `extend_ttl()` on all contracts - Soroban persistent storage requires periodic TTL renewal or data archives.
- `upgrade()` with `#[only_owner]` on all contracts - native contract upgrades.
- `version()` on all contracts - on-chain version query.
- `contractmeta!` binary metadata for WASM version tracking.
- `find_owner()` on Identity Registry - non-panicking variant of `owner_of`. Cross-contract callers (Reputation, Validation) use this to surface a clean `AgentNotFound` error instead of crashing on an archived NFT entry.
- `agent_exists()` on Identity Registry - boolean variant of `find_owner`.
- `total_agents()` on Identity Registry. Backed by the OZ NFT sequential token id counter.
- `request_exists()` on Validation Registry - non-panicking existence check.
- Reserved `agentWallet` metadata key is enforced: `set_metadata` and `register_full` reject this key with `IdentityError::ReservedMetadataKey`, matching the spec requirement that wallet bindings flow through `set_agent_wallet` only.
- Empty key / URI rejection on `set_metadata`, `set_agent_uri`, `append_response` with `EmptyValue`, matching the reference's `require(bytes(...).length > 0)` checks.
- Per-entry size caps on metadata: 64-byte keys, 4096-byte values, 100 keys per agent. Bounds storage growth for the metadata API. The reference has no such caps; on Soroban, where storage is rented and a registered agent can otherwise spam unbounded keys, the caps are necessary spam protection.

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
- [Canonical EVM Reference Contracts](https://github.com/erc-8004/erc-8004-contracts) - the source we anchor on for spec compliance
- [Best Practices](https://github.com/erc-8004/best-practices)

## License

MIT
