# Contributing

Engineering conventions and operational expectations for this repo. The
audit at `audit.md` is the source of truth for known issues and triage.

## Commit conventions

- Conventional commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, `test:`. Use `fix:` for bugfixes and `chore:` for
  housekeeping - do NOT label security patches as `feat:`.
- Title only, no description body.
- Title must be under 70 characters.
- Single hyphen `-`, never em-dash. ASCII only.
- No co-author trailers (no Claude or other AI attribution).
- Commit early and often. Each commit should be one logical change.

## Dependency policy

The TypeScript packages use semver `^` ranges in `package.json`, but the
authoritative versions live in `pnpm-lock.yaml`. The CI job runs
`pnpm install --frozen-lockfile`, so production builds always use the
locked versions. Developers must:

- Never regenerate the lockfile as a side effect of unrelated work. Run
  `pnpm install` only when intentionally adding or upgrading a dep.
- Pin critical security-sensitive deps to exact versions if you have a
  reason to mistrust the upstream's semver discipline. The current
  exact-pin candidates are `@stellar/freighter-api`, `@stellar/stellar-sdk`,
  `@supabase/supabase-js` and `@trionlabs/8004-sdk`.
- Use `packageManager` in `webapp/package.json` to pin pnpm. The CI
  workflow reads from there to keep tooling and CI in sync.

## Contract upgrade path

The three Soroban contracts (identity, reputation, validation) are
upgradeable via the `#[only_owner] upgrade(new_wasm_hash)` entry point.
Important properties:

- Each contract's admin is the address passed to `__constructor` at
  deploy time. There is currently NO timelock and NO multisig wrapper.
  Whoever holds the admin key can replace the contract WASM atomically.
- The reputation and validation registries delegate every authorization
  decision to the identity registry's `find_owner` / `get_approved` /
  `is_approved_for_all`. A compromised identity-registry admin can
  therefore bypass authorization in the dependent registries by shipping
  a malicious replacement WASM. See the trust assumption notes in
  `contracts/reputation-registry/src/contract.rs` and
  `contracts/validation-registry/src/contract.rs`.
- Operators deploying the registries on a fresh network should keep all
  three admin keys under the same custody, or behind the same multisig
  + timelock contract.

## Audit follow-ups

Findings closed since the initial audit are tracked inline in
`audit.md`. The triage list at the bottom of that file groups remaining
items by priority. New audit-style findings should be added as new
sections following the existing severity rubric.
