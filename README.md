# Trustless Agents on Stellar/Soroban

Implementation of the [8004 standard](https://www.8004.org) (Trustless Agents) on Stellar/Soroban.

The 8004 standard enables agent discovery, portable identity, and verifiable reputation. It's originally specified as [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) on Ethereum and this is the Stellar implementation.

Note: The Identity and Reputation registries are stable and deployed across EVM chains. The Validation Registry is still under active community discussion and not yet deployed in the ecosystem. Our implementation follows the current draft spec and may need updates when the design is finalized.

## Deployed Contracts (Testnet)

| Contract | Address |
|----------|---------|
| Identity Registry | [`CAYPUQB3XGXJ76N4H32TUQE2FHJ65BZN62Q2JVMC6U5NWJBUYHNDGALT`](https://stellar.expert/explorer/testnet/contract/CAYPUQB3XGXJ76N4H32TUQE2FHJ65BZN62Q2JVMC6U5NWJBUYHNDGALT) |
| Reputation Registry | [`CACIFRSDXQ5BQDWN6UNKH65IFA2ALRMLVQWRK33EXZYVYOS32TLUP5UG`](https://stellar.expert/explorer/testnet/contract/CACIFRSDXQ5BQDWN6UNKH65IFA2ALRMLVQWRK33EXZYVYOS32TLUP5UG) |
| Validation Registry | [`CDOTQZMJZEWIEWMFQS3HIQBM4WIJANHSYQKMOWMJP6UL6EIZXXVNSD6Y`](https://stellar.expert/explorer/testnet/contract/CDOTQZMJZEWIEWMFQS3HIQBM4WIJANHSYQKMOWMJP6UL6EIZXXVNSD6Y) |

## Architecture

Three independent Soroban contracts in a Cargo workspace:

```
contracts/
  identity-registry/    - Agent registration as NFTs (OZ NonFungibleToken)
  reputation-registry/  - Feedback storage with running aggregates
  validation-registry/  - Third-party attestation requests/responses
packages/
  erc8004-common/       - Shared types and constants
sdk/
  typescript/           - Auto-generated bindings + high-level wrapper
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

Run the full E2E test against testnet: `bash scripts/e2e-testnet.sh`

## TypeScript SDK

Auto-generated typed bindings for each contract, plus a high-level wrapper.

```bash
cd sdk/typescript
npm install && npm run build
```

The SDK includes `readAllFeedback()` which reconstructs feedback history from on-chain events via Soroban RPC, since bulk queries exceed Soroban's per-transaction read limits.

```typescript
import { TESTNET, readAllFeedback, agentIdentifier } from "@trionlabs/stellar-erc8004-sdk";

// Get the global agent identifier
const id = agentIdentifier(TESTNET, 0);
// "stellar:testnet:CAYPUQB3...#0"

// Read all feedback for an agent via event indexing
const feedback = await readAllFeedback(TESTNET, 0);
```

## Spec Coverage

25 out of 26 spec functions implemented on-chain (96%). The remaining function (`readAllFeedback`) is implemented in the TypeScript SDK via event indexing.

| Registry | Spec Functions | On-chain | Coverage | Status |
|----------|---------------|----------|----------|--------|
| Identity | 9 | 9 | 100% | Stable |
| Reputation | 10 | 9 (+1 in SDK) | 100% | Stable |
| Validation | 7 | 7 | 100% | Draft - spec under discussion |

## Differences from the EVM Reference

Soroban is not EVM-compatible. These are the intentional deviations from the Solidity reference:

**Architecture changes:**

- `setAgentWallet` uses Soroban's native `require_auth()` on both caller and new wallet instead of EIP-712 signatures. Simpler, handles replay protection and domain separation natively.
- `getClients`, `getAgentValidations`, `getValidatorRequests` are paginated. Soroban has a per-transaction read limit (~100 entries), so unbounded array returns are not possible.
- `readAllFeedback` moved to TypeScript SDK. Iterating all feedback on-chain would exceed resource limits for any agent with significant history.
- `validationResponse` restricted to the designated validator address. The EVM reference allows any caller, but this creates an overwrite vulnerability where an attacker can replace a legitimate response.

**Storage optimizations:**

- Running aggregates for `getSummary` - updated on each `giveFeedback`/`revokeFeedback` call, enabling O(1) summary queries instead of iterating all entries.
- Indexed storage pattern (count + per-index entries) instead of growing `Vec`/`Map`. Soroban docs warn against unbounded collections in storage.
- On-chain/off-chain data split matches spec: `value`, `valueDecimals`, `tag1`, `tag2`, `isRevoked` are stored. `endpoint`, `feedbackURI`, `feedbackHash` are emitted as events only.

**Type adaptations:**

- `u8` fields changed to `u32` - Soroban's `#[contracttype]` does not support `u8`.
- `uint256` agent IDs changed to `u32` - OZ Stellar NFT uses `u32` token IDs. Supports ~4 billion agents.
- `address` maps to Soroban `Address` (covers both Stellar accounts and contract accounts).

**Soroban-specific additions:**

- `extend_ttl()` on all contracts - Soroban persistent storage requires periodic TTL renewal or data archives.
- `upgrade()` with `#[only_owner]` on all contracts - native contract upgrades.
- `version()` on all contracts - on-chain version query.
- `contractmeta!` binary metadata for WASM version tracking.
- Wallet cleared on NFT transfer via `ContractOverrides` trait.

## Global Agent Identifier

Format: `stellar:{network}:{identityRegistryAddress}#{agentId}`

Example: `stellar:testnet:CAYPUQB3XGXJ76N4H32TUQE2FHJ65BZN62Q2JVMC6U5NWJBUYHNDGALT#0`

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
