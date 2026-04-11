# Technical Reference

Detailed spec coverage, EVM divergences, event layouts, and type mappings for the Stellar 8004 contracts.

## Spec Coverage

Compared against the [8004 reference contracts](https://github.com/erc-8004/erc-8004-contracts) (`master`, 2026-04-08).

| Registry | Spec Functions | Implemented | Partial / Missing |
|----------|----------------|-------------|-------------------|
| Identity | 11 | All 11 | - |
| Reputation | 10 | 8 | `readAllFeedback` off-chain only (explorer HTTP endpoint). `getResponseCount` no `responders[]` filter. `getClients` paginated. |
| Validation | 7 | All 7 | `getAgentValidations` and `getValidatorRequests` paginated. |

Soroban-only additions: `extend_ttl`, `propose_upgrade` / `execute_upgrade` / `cancel_upgrade` / `pending_upgrade` (3-day timelocked upgrades), `version`, `find_owner`, `agent_exists`, `total_agents`, `request_exists`, `token_uri` override, metadata size caps (64B key / 4KB value / 100 keys). OZ 2-step ownership exposed: `get_owner`, `transfer_ownership`, `accept_ownership`, `renounce_ownership`.

## Differences from the EVM Reference

All spec functions are implemented with equivalent behavior. Differences are inherent to Soroban or intentional hardening.

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

- Transfer clears ALL metadata (spec only clears `agentWallet`). Prevents a previous owner's claims from persisting.
- Metadata size caps: 64-byte keys, 4KB values, 100 keys per agent.

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
| `int256` WAD intermediate | `i128` | Overflow at \|value\| > ~1.7e20 with decimals=0; returns `AggregateOverflow` cleanly |

**Naming:** All functions are snake_case per Rust convention. Event indexed string topics are literal Soroban strings (not keccak256 hashes as in Solidity).

## Event Topic Positions

Indexed fields appear in the topic array (positions 1..n), not the data body.

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
