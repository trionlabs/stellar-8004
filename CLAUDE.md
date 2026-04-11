# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

8004 (Trustless Agents) implementation on Stellar/Soroban. Three Soroban smart contracts providing agent identity (NFT), reputation (feedback), and validation (attestation) registries.

## Build and Test

```bash
make build         # Build all contracts to WASM (identity first, then reputation, validation)
make test          # Run all Rust tests (unit + integration)
make test-identity # Run identity registry tests only
make test-reputation
make test-validation
make fmt           # Format code
```

Single test: `cargo test --package identity-registry test_register`

## Architecture

Three independent Soroban contracts in a Cargo workspace:

- **Identity Registry** (`contracts/identity-registry/`) - Agent registration as NFTs using OZ `NonFungibleToken` with `ContractOverrides` to clear wallet on transfer. Sequential minting via `Base::sequential_mint`. Timelocked upgrades (3-day delay). OZ 2-step ownership transfer exposed.
- **Reputation Registry** (`contracts/reputation-registry/`) - Feedback storage with indexed client pattern (no growing Vecs). WAD-normalized `get_summary` computed on demand (requires explicit client list). Cross-contract calls to Identity Registry via `#[contractclient]` for self-feedback prevention.
- **Validation Registry** (`contracts/validation-registry/`) - Request/response lifecycle for third-party attestations. Same `#[contractclient]` pattern for ownership checks.

## Webapp (`webapp/`)

Part of this monorepo (subtree-merged from `github.com/yamancan/stellar8004` on 2026-04-07, full commit history preserved). No longer a separate repo or submodule - this parent repo is the single source of truth.

- **Purpose**: 8004scan explorer/scanner UI - frontend for the contracts deployed by this repo
- **Stack**: pnpm monorepo with SvelteKit (`apps/web`), Soroban event indexer as Supabase Edge Function (`packages/indexer`), DB types (`packages/db`), canonical TS SDK `@trionlabs/8004-sdk` (`packages/sdk`)
- **Canonical TS SDK**: `webapp/packages/sdk/` (`@trionlabs/8004-sdk`). The parent-level `sdk/typescript/` was deleted during the merge - this is now the only TypeScript SDK in the repo
- **Single source of truth for contract addresses**: `webapp/packages/sdk/src/core/config.ts` (`TESTNET_CONFIG`, `MAINNET_CONFIG`). Indexer, frontend env, and scripts should import from there
- **Has its own multi-agent pipeline** (local-only files gitignored by `webapp/.gitignore`): `webapp/CLAUDE.md` (Planner role), `webapp/AGENTS.md`, `webapp/Z.md`, `webapp/CODEX.md`, `webapp/dev.md`. Do NOT confuse with this file

`git log` shows yaman's commits interleaved with ours. Use `git log --first-parent` for a clean linear view.

## Soroban-Specific Constraints

- No `u8` in `#[contracttype]` structs - use `u32` instead (Soroban limitation)
- OZ crates pinned to git commit 9dd85c30 (published 0.6.0 uses soroban-sdk 23, we need 25)
- `#[contractimpl(contracttrait)]` for trait implementations (not `#[default_impl]`)
- Events use `#[contractevent]` structs with `.publish(e)` (not `.emit()`)
- Storage: avoid growing Vec/Map - use count + indexed entries pattern
- TTL constants: threshold=518400, bump=1036800 (~30/60 days at 5s/ledger)

## Testnet Deployment

Deployer: `GCOKXW3XCYYFD7ZXLT75LJPIES5SQGVMLWXKQQHGT2CE2KTSYWRBBWQU`
- Identity Registry: `CA4GKPENYABUM7POQFCN3RDXIDVISC7T5QKHW5BDCJWOFDBW7P5ZCSUG`
- Reputation Registry: `CDKDYYL2PU3HKTCWFCHVAALZGABLFZ4F6MIEE45JKE44VH6VH2D3DHMT`
- Validation Registry: `CD3YFHYEI2JGTBKZTRT7QOMM337POX2G7CPVDBRK6DFDOEFZIQFAOCHD`

## Commit Conventions

- Conventional commits (e.g. `feat:`, `fix:`, `docs:`, `chore:`)
- Title only, no description body
- Titles under 70 characters
- Micro-commits - commit early and often
- No co-author attribution (including Claude)
- Use single `-` not `--` in text
- No unicode characters, no AI-generated characters
