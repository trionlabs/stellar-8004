# Contributing

## Setup

```bash
# Contracts
cargo install stellar-cli
make build && make test

# Webapp
cd webapp
pnpm install
pnpm --filter @trionlabs/stellar8004 build
pnpm dev
```

The Rust toolchain is pinned in `rust-toolchain.toml` - it installs automatically via `rustup`.

## Commits

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`

## Contracts

- Run `make test` before pushing
- Run `cargo clippy --workspace` - must be zero warnings
- Run `make fmt` - must produce no diff
- No `u8` in `#[contracttype]` structs (Soroban limitation, use `u32`)
- Avoid growing `Vec`/`Map` in storage - use the count + indexed entries pattern
- Every persistent storage read must extend TTL
- New error variants go at the end of the enum to preserve ABI codes

## Webapp

- Run `pnpm -r test` before pushing (SDK + indexer tests)
- Run `pnpm -r check` - must be zero errors, zero warnings
- After contract redeploy, update the files listed in the README "After redeploying" section for the smart contract addresses

## Code style

- snake_case for Rust, camelCase for TypeScript

## Pull requests

- One concern per PR
- Tests must pass in CI before merge
- Contract changes require a WASM rebuild and hash verification