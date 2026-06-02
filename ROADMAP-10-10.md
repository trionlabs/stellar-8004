# Road to 10/10

A prioritized hardening + adoption roadmap for the Stellar 8004 stack.
Target bar: **production-grade (mainnet) correctness/security** and **developer
adoption**. Items are ordered by impact, not by area.

> Status: living document. A multi-track review is in progress (contracts,
> web explorer, SDK + indexer, Supabase backend, docs/skills/CI). The
> contracts track and the dependency/version assessment are complete below;
> the other tracks are marked _in progress_ and will be appended.
>
> Security note: the contracts are deployed on mainnet. Findings below are
> described at **fix level** (what to change and why), deliberately omitting
> step-by-step exploitation detail, until the corresponding fixes ship. The
> intended remediation path bundles the fixes into a single timelocked
> in-place upgrade (see "Sequencing").

## Sequencing (why this order)

The three registries ship a 3-day timelocked `propose_upgrade` /
`execute_upgrade` path, which upgrades **in place** — contract addresses and
state are preserved, so no redeploy, no address churn, no indexer re-backfill.
That makes the efficient path:

1. Land the contract correctness/security fixes (below) in code.
2. Add the missing tests that make the upgrade path itself trustworthy
   (a successful post-timelock `execute_upgrade` is currently **untested**),
   plus event-emission assertions the indexer depends on.
3. Bundle the OpenZeppelin `0.6.0 → 0.7.1` + `soroban-sdk 25 → 26` bump into
   the **same** v2 WASM.
4. One `propose → wait 3 days → execute` cycle ships security fixes **and**
   SDK modernization together, in place.

Doing the SDK bump as its own event would mean two separate risky mainnet
touches; bundling makes it one.

## P0 — Contract correctness & security (mainnet)

| ID | Area | Fix |
|----|------|-----|
| C1 | Reputation: self-feedback guard | The self-feedback check covers NFT owner + approved operators but **not the agent's bound operational `agentWallet`**. Extend the guard so the bound wallet cannot leave feedback on its own `agent_id` (add `get_agent_wallet` to the identity client trait and reject it), or explicitly document the allowance. Closes the gap behind the "on-chain self-feedback prevention" guarantee. |
| H1 | Reputation: aggregation input bounds | Accepted feedback `value` range is far wider than what `get_summary` normalization (`value × 1e18`) can hold in `i128`, so an in-range write can make the summary call revert. Tighten the accepted range at write time to what aggregation supports, and/or skip (don't abort on) individual entries that overflow normalization. |
| H2 | Validation: unbounded read | `validation get_summary` loops over **all** of an agent's validations with no cap (reputation caps at 5). Add a `start`/`limit` bound or hard iteration cap to remove the read-budget exhaustion path. |
| M4 | Reputation: summary rounding | `get_summary` divides twice (WAD-average, then to mode decimals), compounding truncation. Compute in a single division (or round-to-nearest) and add a test with non-divisible inputs. |
| M1 | Identity: error surface | `register_full` uses `assert!` (host trap) for metadata caps / reserved-key checks while siblings return typed errors. Return `Result<u32, IdentityError>` for a consistent, auditable error surface. |
| M3 | Validation: validator independence | `validation_request` does not constrain the validator address (self can be named, then self-respond). At minimum reject `validator == owner/caller`; document the independence assumption. |

## P0 — Test trust (prerequisite to any mainnet upgrade)

- **Successful `execute_upgrade` is untested** — every upgrade test cancels
  instead. Add a test that proposes, advances the ledger past the timelock,
  and executes, asserting the new WASM is active. Required before relying on
  the upgrade path on mainnet.
- **Zero event-emission assertions** exist, yet the entire indexer depends on
  the event topic layout documented in `TECHNICAL.md`. Add `env.events()`
  assertions for every emitted event (events already use the typed
  `#[contractevent]` / `#[topic]` macro, so this is straightforward).
- Add a test exercising the bound-`agentWallet` self-feedback path (C1) and
  non-divisible summary math (M4).

## P1 — Timelock hardening

- `propose_upgrade` / `cancel_upgrade` / `execute_upgrade` emit **no events**,
  so the 3-day window can't be watched off-chain except by polling
  `pending_upgrade()`. Emit `UpgradeProposed` / `UpgradeCancelled` /
  `UpgradeExecuted` (the window is the timelock's entire user-facing value).
- Consider time-based (`ledger().timestamp()`) rather than sequence-based
  delay so "3 days" is wall-clock accurate.

## P1 — CI / supply chain

- Add `cargo clippy --all-targets -- -D warnings` to the Rust job (currently
  only `fmt` + `test`).
- Add a Soroban static-analysis pass
  ([`OpenZeppelin/soroban-security-detectors-sdk`](https://github.com/OpenZeppelin/soroban-security-detectors-sdk)).
- The web app currently gets only `check` (typecheck) in CI — **no component
  or e2e tests run**. Add a minimal Playwright/Vitest gate for the explorer's
  critical flows (browse → agent detail → connect → feedback).
- Add `cargo audit` / `pnpm audit` (or Dependabot) for dependency CVEs.

## P1 — Dependency currency

- **OpenZeppelin `stellar-contracts` 0.6.0 → 0.7.1** (the real migration
  work; 0.7.1 requires `soroban-sdk 26` and pulls
  `experimental_spec_shaking_v2`). Your contract code itself is clean against
  `soroban-sdk 26` — none of its breaking changes (token-event removal,
  `assert_in_contract` rename, BLS aliases, internal macros) apply here.
- Bump `stellar-cli` to a Protocol 26 build and regenerate bindings.
- Keep `overflow-checks = true`: it converts the arithmetic findings into
  clean aborts rather than silent corruption.

## P2 — Developer adoption

- **Skill positioning:** the Stellar Foundation now ships an official
  [`stellar/stellar-dev-skill`](https://github.com/stellar/stellar-dev-skill)
  with `soroban/`, `agentic-payments/` (x402 + multi-path payments), and
  `standards/` sub-skills — overlapping `x402s`. Lean `8004s` into the niche
  the official skill does **not** cover (agent identity/reputation/validation),
  compose with rather than duplicate the official skill, and pursue listing
  `8004s` in their `standards/` ecosystem references.
- SDK DX, docs accuracy, onboarding, and examples — _track in progress._

## In-progress tracks (to be appended)

- [ ] Web explorer (UX/resilience/a11y/security) — _review running_
- [ ] SDK + indexer (API design, reorg/idempotency, tests) — _review running_
- [ ] Supabase backend (RLS, migration hygiene, rate-limit races) — _review running_
- [ ] Docs / skills / CI / positioning — _review running_
