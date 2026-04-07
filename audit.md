# Codebase Audit - 2026-04-07

## Context

Ruthless full-codebase audit covering security, code quality, maintainability, and operational risk. Scope is the entire `stellar-trustless-agents` repo: three Soroban contracts, the SvelteKit webapp, the `@trionlabs/8004-sdk` TypeScript SDK, the Soroban event indexer, the Supabase migrations and Edge Functions, and the docker / CI / deploy infrastructure.

Produced via three parallel exploration agents (Rust contracts / TS frontend+SDK / indexer+infra) plus targeted spot-checks of the highest-impact claims. Several agent findings were dropped or downgraded after verification - those drops are listed in section F.

Severity rubric:
- **CRITICAL** - exploitable now, or silent data loss / fund loss path, or breaks an explicit security invariant of the contracts
- **HIGH** - has a concrete attack or breakage scenario, requires non-trivial precondition
- **MEDIUM** - code quality / maintenance hazard with realistic impact
- **LOW** - smell, smell-with-impact-bound, or documentation gap

Findings tagged **[VERIFIED]** were directly read in the source. Findings tagged **[UNVERIFIED]** are based on agent reports that I have not yet personally confirmed - they may be false positives.

---

## A. Soroban Smart Contracts (`contracts/`)

### A1. CRITICAL - `extend_agent_ttl` does not extend `Metadata` entries [DONE in accfb26]
- **File:** `contracts/identity-registry/src/storage.rs:20-33`
- **What:** `extend_agent_ttl(e, agent_id)` only bumps `AgentUri(id)` and `AgentWallet(id)`. The third persistent storage variant - `Metadata(id, key)` - is never extended. There is also no helper that enumerates an agent's metadata keys, so even an explicit caller cannot extend them.
- **Why it matters:** All metadata entries archive after `TTL_THRESHOLD` ledgers (~30 days). Metadata is actively used by `register_full` (`contract.rs:53-67`) and `set_metadata` (`contract.rs:90-102`), so this is real production data getting silently archived. The off-chain indexer doesn't read metadata, so the breakage is invisible until something on-chain calls `get_metadata` and gets `None`.
- **Fix:** Store a `MetadataKeys(agent_id) -> Vec<String>` index alongside writes so `extend_agent_ttl` can iterate and bump every key. Alternative if metadata is unused in practice: grep the SDK / indexer / frontend for any actual caller of `get_metadata` / `set_metadata` / `register_full` - if zero, delete the metadata API entirely.

### A2. CRITICAL - `extend_agent_ttl` does not extend OZ NFT base storage [DONE in ba7e953]
- **File:** `contracts/identity-registry/src/storage.rs:20-33` and `contracts/identity-registry/src/contract.rs:142-145`
- **What:** OZ `NonFungibleToken::Base` keeps owner / balance / approval entries in its own persistent storage slots (`NFTStorageKey::*`). `extend_agent_ttl` only touches `AgentUri` and `AgentWallet` ([VERIFIED] `storage.rs:20-33`). No code path in `contract.rs` explicitly bumps the OZ NFT entries.
- **Why it matters worse than I first thought:** `Base::owner_of` (called from `require_owner_or_approved` at `contract.rs:165`) panics if the owner entry is missing - it does NOT return `Option<Address>`. Once the NFT storage archives, **every** privileged identity-registry call (`set_agent_uri`, `set_metadata`, `set_agent_wallet`, `unset_agent_wallet`) panics. The `give_feedback` cross-contract call in reputation-registry also panics, since it calls `identity.owner_of(agent_id)` (the contractimport! generated client just propagates the panic). The agent becomes uncontrollable AND every reputation/validation interaction with that agent crashes the calling tx.
- **Why I marked this CRITICAL not HIGH:** A1 is "metadata archives, nobody currently reads metadata, silent". A2 is "agent becomes a brick AND poisons every cross-contract call to it". Higher blast radius.
- **Fix:** Have `extend_agent_ttl` also call the OZ `Base` TTL helpers for the agent's NFT entries. Need to read the pinned `stellar-tokens` source at commit `9dd85c30` to find the public TTL helper.
- **Verification:** Add a test that fast-forwards `e.ledger().sequence()` past `TTL_THRESHOLD` without calling extend_ttl, then asserts `owner_of` still returns the owner. Repeat with the proposed fix. The current test suite has nothing like this.

### A3. HIGH - Reputation feedback persistent entries never get TTL extension [DONE in e7dfd7c]
- **File:** `contracts/reputation-registry/src/storage.rs` (`Feedback`, `LastIndex`, `ClientCount`, `ClientAtIndex`, `ClientExists`, `ResponseCount`, `AgentAggregate`, `AgentTagAggregate` entries - the full DataKey enum at lines 14-24)
- **What:** The reputation-registry only has `extend_instance_ttl` (`storage.rs:8-10`). There is no `extend_feedback_ttl` or `extend_aggregate_ttl`. Every persistent entry just sits there until it archives. The read paths (`get_feedback`, `get_aggregate`, `get_clients_paginated`, etc.) don't bump TTL either.
- **Why it matters:** After ~30 days the running aggregates archive. `get_summary` starts returning the default-constructed `SummaryResult { count: 0, summary_value: 0, ...}` (line 139-143 - the `unwrap_or` masks the archival as "no data"). Revoking old feedback fails silently because `revoke_feedback` reads the now-archived `Feedback` entry, and the contract returns `FeedbackNotFound`. The protocol's reputation history evaporates without any error.
- **Fix:** Add explicit TTL extension on every read path that touches a persistent entry (cheap and idempotent in Soroban), and add an `extend_feedback_ttl(agent_id, client, index)` helper that owners can call to keep individual entries alive. Same shape as `identity-registry::extend_agent_ttl`, but for reputation.
- **Counter-argument worth weighing:** The user may intend feedback to be "use it or lose it" - reputation that nobody touches for a month is dead by design. If so, this is intentional and just needs a doc comment plus making the archived state visible (return an error, not zero) instead of a silent default. Ask the user.

### A4. HIGH - Validation registry persistent entries never get TTL extension [DONE in e7dfd7c]
- **File:** `contracts/validation-registry/src/storage.rs` (`Validation`, `AgentValidationCount`, `AgentValidationAt`, `ValidatorRequestCount`, `ValidatorRequestAt` entries)
- **What:** Same shape as A3 per agent report - only `extend_instance_ttl`, no per-entry extension. I have not personally read the validation-registry storage file yet.
- **Why it matters:** Validation responses archive ~30 days after the request. Pagination over agent validations breaks because the `*Count` is preserved (instance TTL) but the `*At(idx)` entries are gone.
- **Fix:** Same as A3.

### A5. HIGH - Aggregate updates use unchecked i128 arithmetic [DONE in 77c1ac7]
- **File:** `contracts/reputation-registry/src/storage.rs:149,162,199,220` (`update_aggregate_add` / `update_aggregate_sub` and the per-tag variants)
- **What:** All four aggregate update sites use `agg.summary_value += value` (lines 149, 199) and `agg.summary_value -= value` (lines 162, 220) on `i128` with no `checked_add` / `checked_sub`. In release mode Rust wraps on overflow without panicking.
- **Why it matters:** A client gives feedback with `value = i128::MAX`, then a second client gives `value = 1`. The aggregate wraps to `i128::MIN`. Revoking the first feedback doesn't restore the aggregate, because revoke uses the same wrapping subtraction in reverse (the inverse of a wrap is another wrap, not the original value). The summary becomes permanently poisoned. There is no entry-level cap on `value`, so this is exploitable by anyone who can call `give_feedback`.
- **Fix:** Use `checked_add` / `checked_sub` and return an `AggregateOverflow` error from `give_feedback` and `revoke_feedback`. Cheaper alternative: validate at entry that `value.abs() <= 10^36` so the aggregate can hold ~100 such entries before overflow - this trades exploit-resistance for slightly less expressive feedback values, which is fine.
- **Side note found while verifying:** `agg.count += 1` (lines 148, 198) and `agg.count -= 1` (lines 161, 219) are also unchecked, but `count` is a `u64` so practically unreachable.

### A6. MEDIUM - `transfer` / `transfer_from` only clears `agent_wallet` [DONE in accfb26]
- **File:** `contracts/identity-registry/src/contract.rs` (the `ContractOverrides` block per the architecture plan)
- **What:** The `ContractOverrides::transfer` and `transfer_from` clear `agent_wallet` but do not clear or migrate `Metadata(agent_id, *)` entries. Metadata set by the previous owner persists into the new owner's account.
- **Why it matters:** Off-chain systems trust an agent's metadata as "what the current owner asserted". An attacker can set authoritative-looking metadata (e.g. `"verified": true`, `"domain": "anthropic.com"`), then transfer the NFT to a victim. The victim now appears to have asserted those claims.
- **Fix:** Either clear all metadata in the transfer overrides (requires a metadata-key index - see A1), or document explicitly that metadata is non-transferable claims attached to the NFT and the off-chain layer must verify the claim was made by the current owner.

### A7. MEDIUM - `set_metadata` accepts unbounded key length and value size [DONE in 35d9dba]
- **File:** `contracts/identity-registry/src/contract.rs` (the `set_metadata` entry point)
- **What:** No length validation on the `String` key or the `Bytes` value.
- **Why it matters:** A registered agent (anyone with 1 friendbot funding) can call `set_metadata` with a 64 KB key and a 100 KB value, paying minimal storage rent for storage that lives until TTL archive (~30 days). At scale this is a cheap storage spam vector.
- **Fix:** Cap key at e.g. 64 bytes and value at 4 KB. Errors should be `MetadataKeyTooLong` / `MetadataValueTooLong`.

### A8. MEDIUM - `get_summary` with explicit `client_addresses` is O(clients x max_index)
- **File:** `contracts/reputation-registry/src/contract.rs` (the `get_summary` body)
- **What:** When `client_addresses` is non-empty, the contract loops each address x every index 1..=last_index, doing one storage read per cell. With 1000 clients x 1000 feedback rows that's 1 million persistent reads - well over Soroban's 100-entry per-tx read limit.
- **Why it matters:** This function will simply revert with `ExceededLimit` for any popular agent. It is effectively unusable for its stated purpose. The "all clients" path uses the running aggregate and is fine.
- **Fix:** Either pre-compute per-client aggregates (mirror the `AgentAggregate` pattern keyed by client address) and read those, or document that `client_addresses` must be <= 5 entries and refuse longer lists with `TooManyClients`.

### A9. MEDIUM - Sequential client / response counters are unchecked u32 increments [DONE in 72d2159]
- **File:** `contracts/reputation-registry/src/storage.rs:86` (`add_client`) and `contracts/reputation-registry/src/storage.rs:129` (`increment_response_count`). There is **no** `add_responder` function - I had this wrong in the agent report. There is no responder tracking at all, only a count.
- **What:** Both increments are `&(count + 1)` with no overflow check. `ClientCount` and `ResponseCount` are both `u32`.
- **Why it matters:** Practically unreachable (4 billion clients per agent, 4 billion responses per feedback) but if it ever wraps, pagination silently restarts at index 0 and corrupts the indexed-storage invariant.
- **Fix:** `count.checked_add(1).ok_or(Err::CountOverflow)?`. Same fix in validation-registry for `AgentValidationCount` / `ValidatorRequestCount`.
- **Adjacent finding:** The lack of any responder identity tracking means that the same address can `append_response` multiple times to the same feedback and the contract just bumps the counter. The on-chain record has no way to enumerate responders - the explorer must reconstruct from `ResponseAppended` events. This is by design (per the architecture plan) but worth documenting.

### A10. MEDIUM - `revoke_feedback` / `give_feedback` cross-contract trust
- **File:** `contracts/reputation-registry/src/contract.rs` (`give_feedback`)
- **What:** The self-feedback prevention is `caller != owner_of(agent_id) && caller != get_approved(agent_id) && !is_approved_for_all(owner, caller)`. All three calls go to the identity registry, which is upgradeable. A compromised identity-registry admin can replace its WASM with one that returns `None` from `owner_of` for arbitrary agents, breaking self-feedback prevention.
- **Why it matters:** This is the standard upgradeable-contract trust model, but it's worth documenting. The reputation registry's security depends on the identity registry's admin key staying honest.
- **Fix:** Document the trust assumption in `contracts/reputation-registry/src/contract.rs` rustdoc, and consider whether the identity-registry upgrade path should be timelocked or multi-sig.

### A11. LOW - Pagination is silent on `None` slots
- **File:** `contracts/reputation-registry/src/storage.rs` (`get_clients_paginated`)
- **What:** The loop reads `ClientAtIndex(agent_id, i)` and pushes whatever it gets. If a slot was deleted (currently no code path deletes, but future revoke-cleanup could), the function returns fewer entries than `limit` without indication.
- **Why it matters:** Callers can't distinguish "end of list" from "tombstoned slot mid-range".
- **Fix:** Either guarantee no tombstones (current behavior) and add a comment, or return `Vec<Option<Address>>` so callers can tell.

### A12. LOW - Validation `average_response` truncates
- **File:** `contracts/validation-registry/src/contract.rs` (the `get_summary` body)
- **What:** `(total_response / match_count) as u32` is integer division.
- **Why it matters:** A summary of `[51, 50]` returns `50`, not `50.5`. Display layer can multiply by 100 and lose 1% precision.
- **Fix:** Either return `(total_response, match_count)` and let the caller compute, or return a fixed-point integer with documented scale.

### A13. LOW - TTL constants are correct but the comment is fragile [VERIFIED]
- **File:** `contracts/identity-registry/src/storage.rs:3-6`
- **What:** `TTL_THRESHOLD = 518_400` is in **ledgers**, and at 5s/ledger that's 30 days. The comment says so. **Agent 1 claimed this comment is wrong; my recheck confirms it is correct.** The fragility is that the constant is duplicated across all three contracts and hand-maintained. If Soroban ever changes ledger timing, all three must be updated together. The architecture plan called for an `erc8004-common` crate; recent commit `0e7ef9f refactor: inline constants, remove erc8004-common crate` shows we already had this and threw it away.
- **Fix:** Either reintroduce the shared crate (the inline-and-delete refactor was probably wrong), or accept the duplication and add a comment in each constant pointing at the others as siblings.

### A14. CRITICAL - `Base::owner_of` panics instead of returning Option [DONE in d7775d3]
- **File:** `contracts/identity-registry/src/contract.rs:165` (`require_owner_or_approved`) and any caller of `Base::owner_of`
- **What:** `let owner = Base::owner_of(e, agent_id);` is unwrapped at line 165. The OZ NFT `Base::owner_of` returns `Address` directly, not `Option<Address>` - if no owner is set (NFT entry archived or never minted), it panics inside the OZ helper.
- **Why it matters:** This compounds A2: not only does an archived NFT make `set_agent_uri`/`set_metadata`/`set_agent_wallet`/`unset_agent_wallet` panic, the panic propagates to `give_feedback` in reputation-registry too (which calls `identity.owner_of(agent_id)` for the self-feedback check). And to `validation_request` in validation-registry (same cross-contract pattern). One archived agent crashes any cross-contract call into it. Failure mode is "the explorer tries to read this agent's data and the request is `transaction failed: HostError(Storage, MissingValue)`".
- **Fix:** Wrap `Base::owner_of` in a check using `Base::balance_of(owner) > 0` first (or `Base::token_exists` if OZ provides it at the pinned commit). Return a proper `IdentityError::AgentNotFound` instead of panicking. This is necessary regardless of whether A2 is fixed - the panic-on-missing path should never be reachable from a hostile caller.

### A15. MEDIUM - Architecture plan describes Ed25519 wallet auth; code uses `require_auth` [VERIFIED]
- **File:** `contracts/identity-registry/src/contract.rs:110-122` (`set_agent_wallet`)
- **What:** The architecture plan in `.claude/plans/rippling-singing-tower.md` describes Ed25519 signature verification: "set_agent_wallet(... deadline: u64, signature: BytesN<64>, public_key: BytesN<32>) ... verifies via `e.crypto().ed25519_verify(public_key, message, signature)`". The actual implementation has neither `deadline` nor `signature` nor `public_key` parameters - it just calls `new_wallet.require_auth()` (line 117) and trusts Soroban's native auth system.
- **Why it matters:** The simpler code is probably correct (Soroban's `require_auth` already handles nonce-based replay protection and binds to the contract instance), but it has different semantics than the plan documented. Specifically: the plan supported designating a wallet that wasn't online at the moment - the user provides a pre-signed Ed25519 sig, the contract verifies it offline. The code requires the new wallet to actively sign right now, which means a smart contract wallet that doesn't implement `__check_auth` cannot be set as an agent_wallet. This is the contract-side analogue of B1.
- **Fix:** Either update the architecture plan to match the code (cheap), or add the Ed25519 path back as an alternative entry point (expensive). Given that the only consumers right now are Freighter and similar EOA-style wallets, the cheap fix is fine. But the architecture plan should not be treated as a current spec until it's reconciled.

---

## B. SDK and Webapp (`webapp/packages/sdk/`, `webapp/apps/web/`)

### B1. HIGH - `validateStellarAddress` rejects all C-addresses (smart wallet contracts) [DONE in 08e32c7]
- **File:** `webapp/packages/sdk/src/core/helpers.ts:54-58`
- **What:** Hardcoded to `StellarSdk.StrKey.isValidEd25519PublicKey`. C-addresses (smart contract / passkey wallets) fail validation.
- **Why it matters:** The whole point of an "agent identity" registry is to support contract-controlled agents. Right now, any user trying to set a Soroban smart wallet (Lobstr, Soroban-passkey-kit, custom MPC) as the agent owner or wallet is bounced at the SDK boundary. The contract code itself is fine with C-addresses (they're just `Address` to Soroban) - only the SDK is wrong.
- **Fix:** `if (!StrKey.isValidEd25519PublicKey(addr) && !StrKey.isValidContract(addr)) throw ...`. Same fix is needed in B2 below.

### B2. HIGH - Indexer parsers also reject C-addresses, silently dropping events [DONE in 08e32c7]
- **File:** `webapp/packages/indexer/src/helpers.ts` (`isValidStellarAddress`)
- **What:** Same G-only check as B1, but used by event parsers. When a contract address appears as `owner`, `wallet`, `client_address`, or `validator_address` in an emitted event, the parser returns `null` and the indexer logs a warning and moves on.
- **Why it matters:** Smart-wallet agents are invisible in the explorer. They can register on-chain but never appear on stellar8004.com. Worse, this is a silent data loss with only a log line.
- **Fix:** Mirror B1 - accept both Ed25519 and contract addresses. Verify the database schema actually allows storing C-addresses (no `LIKE 'G%'` constraint anywhere).

### B3. HIGH - `validateStellarAddress` is the gate at every privileged action, but is bypassed in some forms
- **File:** `webapp/apps/web/src/lib/components/agent-edit/WalletBinding.svelte` (and any other component that takes an address input)
- **What:** Need to verify that every form input accepting an address routes through `validateStellarAddress` before reaching the contract call. Right now I have not enumerated every form. The risk: a form path that skips validation lets a malformed address into `set_agent_wallet`, which then fails on-chain after the user has paid gas.
- **Fix:** Audit every `<input>` that accepts an address. Centralize via an `<AddressInput>` component that validates on blur and refuses to enable submit until valid.

### B4. MEDIUM - `buildMetadataJsonForEdit` silently drops legacy `endpoints` field
- **File:** `webapp/packages/sdk/src/core/metadata.ts:41` (the `KNOWN_FIELDS` array) and `:48-70` (the function body)
- **What:** `KNOWN_FIELDS` includes `'endpoints'`, so existing-metadata `endpoints` is filtered out of `preserved`. But the function only writes `services`, not `endpoints`. Result: when an agent originally registered with the legacy `endpoints` schema is edited, the edit drops `endpoints` and writes only `services`. The user sees "save successful" but legacy `endpoints` is gone.
- **Why it matters:** Pre-spec-migration agents (the original 10 mentioned in `_archive/018_PHASE6_URI_EXTRACT.md`) silently lose their endpoint data on first edit. The data is on-chain and reconstructible from event history, but the live state is wrong. Combined with B1/B2 if the indexer dropped the original event, the data is unrecoverable.
- **Fix:** Either translate `endpoints -> services` automatically when reading existing metadata (the same migration that the backfill SQL does on the DB side), or add `endpoints` to the preserved list AND surface a warning in the edit UI. Test by editing one of the legacy agents.
- **Note:** Agent 2 reported this file with a wrong CRITICAL diagnosis (claimed unsafe field shadowing of `name`/`description`). My re-read shows the shadowing risk is gone because `KNOWN_FIELDS` filters them out. The actual bug at this site is the silent legacy-field drop above.

### B5. MEDIUM - `formatSorobanError` truncates at 200 chars without a console fallback
- **File:** `webapp/packages/sdk/src/core/helpers.ts` (the truncation branch)
- **What:** Long error messages get sliced to 200 chars + `...`. The full message is not logged to console and not preserved anywhere.
- **Why it matters:** Soroban error messages from the RPC are routinely 500-2000 chars (XDR-encoded contract error context). The `...` swallows the actual error code, making bug reports useless. Users say "it failed with `Transaction failed...`" and have no diagnostic.
- **Fix:** Always `console.error` the full original error before truncating, and add a "Copy full error" button next to the displayed truncation in the UI components that surface errors.

### B6. MEDIUM - `generateRequestNonce` deviates from spec but only documents it in a comment
- **File:** `webapp/packages/sdk/src/core/helpers.ts` (`generateRequestNonce`)
- **What:** ERC-8004 spec defines `request_hash` as a content commitment over the validation work. The SDK treats it as a random nonce ("not a content hash, only a unique lookup key") and only flags this in a doc comment. No callers can opt into the spec-compliant behavior.
- **Why it matters:** Cross-chain interoperability (the entire reason ERC-8004 exists) breaks. A validator that expects `request_hash == sha256(work)` will always reject our requests.
- **Fix:** Add an optional `requestHash?: Uint8Array` parameter; default to nonce mode; if a hash is provided, use it as-is. Update `requestValidation` callers to pass a real hash when content is available.

### B7. MEDIUM - Two `target="_blank"` links lack `rel="noopener noreferrer"` [DONE in 244a51c]
- **File:** `webapp/apps/web/src/routes/agents/[id]/edit/+page.svelte:143` and `webapp/apps/web/src/routes/agents/[id]/+page.svelte:186`
- **What:** Both have `rel="noopener"` but not `rel="noopener noreferrer"`. The destination is `stellar.expert/explorer/...`.
- **Why it matters:** `noopener` blocks `window.opener` reference. The missing `noreferrer` leaks the source URL (which contains `agent_id` and possibly the `tx` query param) to the destination via the Referer header. stellar.expert isn't malicious so the practical risk is bounded, but the pattern should be fixed everywhere because the next link added might point at a user-controlled URI from agent metadata.
- **Fix:** Add `noreferrer` to both, and grep for any other `target="_blank"` to fix consistently.

### B8. MEDIUM - Ranged dependencies without an enforced lockfile policy
- **File:** `webapp/apps/web/package.json`, `webapp/packages/sdk/package.json`, `webapp/packages/indexer/package.json`
- **What:** Most deps use `^x.y.z`. The repo has `pnpm-lock.yaml` so installs are deterministic, but the CI command (`pnpm install --frozen-lockfile`) is the only enforcement and is easily skipped in local dev.
- **Why it matters:** A regenerated lockfile from a developer machine can pull a new minor version of `@stellar/freighter-api`, `@supabase/supabase-js`, or `@stellar/stellar-sdk` and ship a regression. None of these libraries are stable enough for blanket caret ranges.
- **Fix:** Pin the four most critical deps to exact versions: `@stellar/freighter-api`, `@stellar/stellar-sdk`, `@supabase/supabase-js`, `@trionlabs/8004-sdk` (when published). Document the policy in the repo root readme.

### B9. MEDIUM - `wallet.address!` non-null assertions in submit handlers
- **File:** `webapp/apps/web/src/routes/register/+page.svelte:92,93,115,116`, `webapp/apps/web/src/routes/agents/[id]/edit/+page.svelte:106`
- **What:** Submit handlers assume the wallet is connected and use `wallet.address!`. Wallet state is reactive ($state); a disconnect race between the click and the transaction build will produce `signAndSend` against `undefined` and a confusing runtime error.
- **Why it matters:** Most users won't hit this, but anyone with a wallet auto-disconnect timer (Freighter's lock screen, Lobstr session expiry) will.
- **Fix:** Replace each `!` with an explicit `if (!wallet.address) { errorMsg = 'Wallet disconnected'; status = 'error'; return; }` at the top of the handler.

### B10. LOW - `sessionStorage` for registration form state has no per-tab namespacing
- **File:** `webapp/apps/web/src/routes/register/+page.svelte:25` (the `STORAGE_KEY` constant)
- **What:** Two browser tabs editing the registration form will overwrite each other's draft.
- **Why it matters:** Quality-of-life issue for power users. Not a bug, but the kind of thing that bites at demo time.
- **Fix:** Either use `crypto.randomUUID()` per tab (won't survive refresh) or accept this and document it. Probably accept.

### B11. LOW - Freighter signer accepts an `address` opt that overrides `this.publicKey`
- **File:** `webapp/packages/sdk/src/signers/freighter.ts:109-126,128-172`
- **What:** Both `signTransaction` and `signAuthEntry` accept an optional `address` opt that, if passed, takes precedence over the connected `publicKey`. A buggy caller could pass the wrong address.
- **Why it matters:** Mitigated because Freighter's UI displays the address being signed for, so the user sees the discrepancy. But if the app routes around Freighter's UI (presigned tx flow, batch signing), the safety net disappears.
- **Fix:** Either remove the `address` opt entirely or, if it's needed for multi-account UX, add an explicit warning when `opts.address !== this.publicKey`.

### B12. LOW - `as unknown as X` casts in the signer hot path
- **File:** `webapp/packages/sdk/src/signers/freighter.ts:52,166`
- **What:** Two `as unknown as` casts. Line 52 force-casts the dynamic import. Line 166 casts `signedAuthEntry` to a synthetic interface to call `.toString('base64')`.
- **Why it matters:** Runtime type assumptions are buried. If Freighter changes the return type, TypeScript is happy and the runtime explodes.
- **Fix:** Replace line 166 with `Buffer.isBuffer(signedAuthEntry) ? signedAuthEntry.toString('base64') : String(signedAuthEntry)` and a `typeof` guard. Line 52 is fine; the failure mode is already handled by the catch.

### B13. LOW - Owner-filter on /agents page is post-DB filtering
- **File:** `webapp/apps/web/src/routes/agents/+page.server.ts:164,215` (TODO comments yaman left)
- **What:** Owner filter is applied client-side after the DB query, so pagination counts are wrong (DB returns 50, client filter drops to 12, "showing 1-50 of 12" UI bug).
- **Why it matters:** Visible-but-trivial UI bug for the "My Agents" view.
- **Fix:** Move the owner filter into the `search_agents` / `search_agents_advanced` RPC parameters. Schema change required.

### B14. LOW - Magic numbers (max-name-length, etc.) duplicated across components and validators
- **File:** `webapp/apps/web/src/lib/components/register/StepBasicInfo.svelte:24` (`maxlength="256"`), and the same `256` repeated in `webapp/apps/web/src/routes/agents/[id]/edit/+page.svelte:80` and `webapp/packages/sdk/src/core/helpers.ts` (validateTag has its own `MAX_TAG_LENGTH = 64`).
- **Fix:** Centralize in `webapp/packages/sdk/src/core/constants.ts` and import everywhere. Same for IPFS gateway list, fetch timeouts, batch sizes.

### B15. LOW - Pre-existing Svelte 5 `state_referenced_locally` warnings
- **File:** `webapp/apps/web/src/routes/agents/[id]/edit/+page.svelte:25-29,36-37,42`
- **What:** The `pnpm check` output during the merge verification reported 17 warnings, all in this one file, all about `data` being captured at component-init time instead of read inside a `$derived` / closure.
- **Why it matters:** Each one is a real reactivity bug - if `data` updates (which it does on `invalidateAll()` after save), the captured local copy stays stale. The save flow currently works because it triggers a `goto`, so the stale state is hidden. Any future flow that mutates `data` in place will hit it.
- **Fix:** Wrap each captured field in `$derived(() => data.agent.foo)`.

---

## C. Indexer, Supabase, Edge Functions (`webapp/packages/indexer/`, `webapp/supabase/`)

### C1. CRITICAL - `feedback.value` schema-vs-runtime mismatch on legacy data
- **Files:** `webapp/supabase/migrations/003_feedback.sql:9` (originally `numeric(39,18)`) and `webapp/supabase/migrations/016_schema_validation_hardening.sql` (widens to `numeric(78,0)`)
- **What:** The original schema couldn't represent the full i128 range. Migration 016 widens it after the fact. The widening is a `USING value::numeric(78,0)` cast - but if any historical row already had a value that overflowed `numeric(39,18)`, it was either truncated on insert (PostgreSQL would error and rollback) or rejected entirely. **Confirm:** likely PostgreSQL rejected the inserts and the indexer logged failures, in which case the bug is "indexer dropped events" not "data was truncated". Either way, the historical event log on-chain has feedback that is not in the DB.
- **Why it matters:** Anyone running this indexer from the deploy ledger sees gaps in feedback history that don't correspond to any indexer error log they still have access to.
- **Fix:** Run `scripts/backfill-events.ts` from the deploy ledger and diff the resulting row count against the live DB. Flag any agent_id x feedback_index that exists in events but not in the DB. (Also: widen `feedback.value` to `numeric(78,0)` was already done in 016 - this issue is about the historical gap, not the current schema.)

### C2. HIGH - URI resolver has no JSON size or depth bound [DONE in fe98496]
- **File:** `webapp/supabase/functions/_shared/uri.ts` (`resolveUri` / `fetchJson`) and `webapp/scripts/backfill-events.ts` (the same logic, duplicated)
- **What:** `await response.json()` on remote IPFS / HTTPS data. No `Content-Length` check before reading, no `Content-Type` whitelist beyond what `fetch` enforces, no JSON depth limit, no field count limit.
- **Why it matters:** A malicious agent registers with `agent_uri = ipfs://Qm...` pointing at a 100 MB JSON bomb. Edge Function's `resolve-uris` invocation OOMs and crashes. Cron retries forever (until `MAX_ATTEMPTS = 5` per agent, but a new agent can register every minute and re-fill the queue). The edge function is denial-of-serviced indefinitely.
- **Fix:** Read the response as a stream, abort if `Content-Length > 1 MB` (or if no `Content-Length`, abort the stream once 1 MB is consumed), then `JSON.parse` the bounded buffer. Reject with retry-counter increment on any abort. SSRF guard the URL too: reject `127.0.0.1`, `169.254.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` before fetching.

### C3. HIGH - `scValToNative` calls in parsers can throw, and the catch is at the top of the run
- **File:** `webapp/packages/indexer/src/parsers/identity.ts`, `parsers/reputation.ts`, `parsers/validation.ts` (anywhere `scValToNative(event.topic[i])` or `scValToNative(event.data)` appears without a try/catch)
- **What:** A malformed event from the RPC (or from a malicious contract upgrade emitting non-conforming events) makes `scValToNative` throw. The thrown error bubbles up to the indexer's outer try in `webapp/packages/indexer/src/indexer.ts` (around line 225-233 per Agent 3's read), increments the error counter, and continues. Continue is OK, but the granularity is wrong: a single bad event marks the entire batch as failed, advancing the cursor past valid events.
- **Why it matters:** Either silently lose valid events (if the cursor advances past them) or get stuck retrying the same bad batch forever (if the cursor doesn't advance). Both are real failure modes.
- **Fix:** Wrap each `scValToNative` call site in try/catch, return `null` from the parser on failure, log a structured warning with the raw event topic bytes and tx hash so the operator can inspect.

### C4. HIGH - `api/lib/rate-limit.ts` is concurrency-racy, but NOT in the way Agent 3 claimed
- **File:** `webapp/supabase/functions/api/lib/rate-limit.ts:14-29`
- **What:** Reading my spot-check above: the count and the insert run in `Promise.all`, which means the count snapshot may or may not include the row that was just inserted (depends on which finishes first at the DB level under READ COMMITTED). Worse, two concurrent requests from the same IP can both see `count = N` (without the other's insert) and both pass the `count <= 30` check, blowing past the limit. **Agent 3's "off-by-one" diagnosis was wrong** - `count <= LIMIT_PER_MINUTE` correctly allows exactly 30 - but the bigger concurrency bug is real.
- **Why it matters:** Real-world rate limit is closer to `30 x concurrent_workers` than `30`. With 5 Edge Function instances under load, an attacker gets ~150 req/min before being throttled.
- **Fix:** Either:
  - (a) Move to `INSERT ... RETURNING (SELECT count(*) FROM api_rate_limits WHERE ip = ... AND requested_at >= ...)` in a single SQL statement, OR
  - (b) Use a Postgres advisory lock keyed by `hashtext(ip)` for the duration of the insert, OR
  - (c) Accept the race and document that the limit is "30 per IP per minute, plus burst proportional to concurrent function instances".

### C5. HIGH - Indexer + backfill script can run concurrently and produce stale upserts
- **File:** `webapp/scripts/backfill-events.ts:327-346` (the agents upsert) and `webapp/supabase/functions/indexer/index.ts` (the cron-triggered run)
- **What:** Both processes upsert to the `agents` table on `id`. Backfill walks ledgers from the deploy ledger forward; the live indexer is at the head. If they overlap on a `Registered` event, the backfill (older event with older `agent_uri`) overwrites the indexer's fresher write (newer `agent_uri` from a later `URIUpdated` event in the same range).
- **Why it matters:** Running backfill while the indexer is running silently rolls back agent URIs to their first-registered value. The fix in 015 (async URI resolution) makes this worse, because `agent_uri_data` gets re-NULLed for re-resolution.
- **Fix:** Either (a) take the indexer lock from `acquire_indexer_lock()` before running backfill, refusing to start if it can't acquire, or (b) make the backfill upsert conditional: `WHERE excluded.created_ledger > agents.created_ledger`. Option (b) is more flexible but requires schema awareness in the backfill.

### C6. HIGH - pg_cron Authorization header may be logged by Kong
- **Files:** `webapp/supabase/migrations/022_fix_cron_vault_integration.sql` (the `apikey` injection) and `webapp/docker/docker-compose.supabase.yml` (Kong access log config)
- **What:** Cron jobs build an HTTP request with `Authorization: Bearer <service_role_key from vault>` and send it through Kong to the Edge Function. Kong's default `KONG_PROXY_ACCESS_LOG: /dev/stdout` log format typically includes request headers when `combined` is set, depending on the Kong build. **I have not verified the exact log format used in this deployment** - Agent 3's claim is plausible but I should read the actual Kong config before treating this as confirmed.
- **Why it matters:** If true, the service role key is in plaintext in Docker logs, which on Dokploy means it's in the host filesystem and any operator with SSH access can grep it out.
- **Fix:** First verify by inspecting the actual `kong.yml` and the running container logs in dev. If confirmed: configure Kong to mask the `apikey` and `Authorization` headers in the access log format string. Better long-term fix: use mTLS between Edge Functions and Kong instead of bearer tokens.

### C7. HIGH - `pg_advisory_xact_lock` for response_index has no timeout [DONE in 610d2e7]
- **File:** `webapp/supabase/migrations/021_fix_response_index_concurrency.sql:30-34`
- **What:** Advisory lock acquired with no `lock_timeout`. If the holding transaction stalls (slow query, statement timeout that doesn't fire because there's no statement running), the next requester waits indefinitely.
- **Why it matters:** A single slow `insert_feedback_response` can wedge the indexer. The indexer's outer cursor advance never fires, and from outside it just looks "stuck".
- **Fix:** `SET LOCAL lock_timeout = '5s'; PERFORM pg_advisory_xact_lock(...);` and let the outer indexer retry on timeout.

### C8. MEDIUM - `validations.tag` has no length constraint and no index [DONE in 96044e2]
- **Files:** `webapp/supabase/migrations/005_validations.sql:12,20-23`
- **What:** `tag text` with no `CHECK (length(...) <= ...)` and no index. Migration 016 added length and index for `feedback.tag1` and `feedback.tag2` but missed `validations.tag` entirely.
- **Why it matters:** A validator can submit a 10 MB tag and bloat the table. Queries filtering by tag full-table-scan.
- **Fix:** New migration: `ALTER TABLE validations ADD CONSTRAINT validations_tag_length CHECK (length(tag) <= 64); CREATE INDEX idx_validations_tag ON validations(tag) WHERE tag IS NOT NULL AND tag <> '';`

### C9. MEDIUM - `vault-setup.sql` placeholder substitution has no failure mode
- **Files:** `webapp/supabase/vault-setup.sql:14-27` and `webapp/docker/docker-compose.supabase.yml:733-736` (the sed-on-startup pattern)
- **What:** The migrate container `sed`s `__INDEXER_SECRET__` and `__SERVICE_ROLE_KEY__` in `vault-setup.sql` from environment variables. If the env vars are unset, sed substitutes empty strings. The vault stores the empty string as the secret. Cron jobs then try to authenticate with `Bearer ` (empty) and get 401 from Kong. There is no loud failure, just silent 401s that look like any other auth misconfig.
- **Fix:** Add an explicit check at the top of `vault-setup.sql`: `DO $$ BEGIN IF '__INDEXER_SECRET__' = '__INDEXER_SECRET__' THEN RAISE EXCEPTION 'INDEXER_SECRET placeholder not substituted'; END IF; END $$;`. Also add a healthcheck that exercises the cron auth path on first deploy.

### C10. MEDIUM - `resolve-uris` retry counter has no backoff and no terminal-state cleanup
- **File:** `webapp/supabase/functions/resolve-uris/index.ts` (and the `MAX_ATTEMPTS = 5` constant)
- **What:** Each failed resolve increments `uri_resolve_attempts` by 1. After 5 attempts the agent is skipped forever. There is no exponential backoff, no terminal "permanently failed" state, and no operator surface to retry manually after a known IPFS gateway recovers.
- **Why it matters:** A transient gateway outage (e.g. ipfs.io down for an hour) burns through all 5 attempts inside that hour. Once the gateway recovers, those agents stay broken until somebody manually `UPDATE agents SET uri_resolve_attempts = 0 WHERE uri_resolve_attempts >= 5`.
- **Fix:** Add a `last_resolve_attempt_at` timestamp; only retry if `now() - last_resolve_attempt_at > pow(2, attempts) * '1 minute'::interval`. Add an admin endpoint (or just an SQL helper) to bulk-reset failed resolves.

### C11. MEDIUM - `feedback_responses.response_index` race fix doesn't cover backfill writes
- **File:** `webapp/supabase/migrations/021_fix_response_index_concurrency.sql` and `webapp/scripts/backfill-events.ts`
- **What:** The advisory lock fix is in the SQL function `insert_feedback_response`, which the indexer calls. The backfill script may or may not call the same function - if it does direct INSERTs into `feedback_responses`, the lock is bypassed.
- **Verification needed:** read `backfill-events.ts` and confirm which path it uses.
- **Fix:** Force the backfill through `insert_feedback_response`. If it can't (e.g. for performance reasons), document that backfill must run with the indexer stopped.

### C12. MEDIUM - `indexer-health` endpoint protected by static bearer, no rate limit
- **File:** `webapp/supabase/functions/indexer-health/index.ts:16-78`
- **What:** Static bearer token from env. If a monitoring agent leaks the token (CI logs, error reports, browser DevTools, accidentally git committed), an attacker can spam the endpoint at will. Each call hits the DB.
- **Why it matters:** Cheap DoS amplification - a leaked token lets one attacker cost the operator real DB CPU.
- **Fix:** Either rotate the token regularly via the same vault pattern, or add per-IP rate limiting reusing the `api_rate_limits` table (with a smaller window for monitoring traffic patterns).

### C13. MEDIUM - Migrations are not idempotent; concurrent deploys break
- **File:** `.github/workflows/deploy-webapp-vps.yml` (the migration application loop) and the migrations themselves
- **What:** Migrations apply via `psql -v ON_ERROR_STOP=1` against a running DB. If two CI runs trigger simultaneously (not impossible with manual `workflow_dispatch` on a slow main branch), both see the same `schema_migrations` snapshot, both try to apply the same file, the second fails with duplicate-key on the `schema_migrations` insert and aborts.
- **Why it matters:** Visible only on race conditions but produces a half-applied migration state if any DDL commits before the duplicate-key check.
- **Fix:** Wrap each migration application in `BEGIN; INSERT INTO schema_migrations ... ON CONFLICT DO NOTHING RETURNING 1; ... apply only if returning row exists; COMMIT;`.

### C14. MEDIUM - Realtime publication exposes `feedback_uri` and `feedback_hash` [DONE in 1b5f83b]
- **File:** `webapp/supabase/migrations/016_schema_validation_hardening.sql:174-183`
- **What:** The realtime publication ALTER includes `feedback_uri` and `feedback_hash` columns. Any subscriber to the `feedback` channel sees these as they're written.
- **Why it matters:** Information disclosure - an attacker subscribing to realtime updates sees IPFS URIs as soon as feedback is submitted, before any UI displays them. Combined with C2 (no SSRF guard on resolve), they can race the resolver to fetch and possibly tamper with the gateway response.
- **Fix:** Remove `feedback_uri` and `feedback_hash` from the realtime publication column list. Surface them only via the API endpoint where the operator can apply rate limits and access checks.

### C15. MEDIUM - `search_agents` function lacks explicit GRANT [DONE in 96044e2]
- **File:** `webapp/supabase/migrations/016_schema_validation_hardening.sql` (the `CREATE OR REPLACE FUNCTION search_agents` block)
- **What:** Function created with `STABLE` and `SET search_path = ''`, but no explicit `GRANT EXECUTE TO anon, authenticated`. It works today because of default-PUBLIC GRANTs on functions, but a future Postgres `REVOKE EXECUTE ON ALL FUNCTIONS FROM PUBLIC` (which is a recommended hardening step) would silently break it.
- **Fix:** Append `GRANT EXECUTE ON FUNCTION public.search_agents(text, integer, integer) TO anon, authenticated;` to the migration.

### C16. LOW - Backfill / recover scripts hardcode contract addresses
- **Files:** `webapp/scripts/backfill-events.ts:26-28`, `webapp/scripts/recover-agents.ts:19`
- **What:** Contract addresses repeated. Single-source-of-truth principle says they should import from `@trionlabs/8004-sdk` (`TESTNET_CONFIG.contracts`) like the indexer config does (or should - see C17 below).
- **Fix:** Refactor to import from the SDK. Same fix for `webapp/packages/indexer/src/config.ts`.

### C17. LOW - `webapp/packages/indexer/src/config.ts` has its own copy of contract addresses
- **File:** `webapp/packages/indexer/src/config.ts:17-33`
- **What:** Contains `TESTNET` and `MAINNET` blocks with the same addresses that live in `webapp/packages/sdk/src/core/config.ts`. The indexer is a separate package and currently imports the SDK only for types - it could just as easily import the config object.
- **Fix:** Have the indexer import `TESTNET_CONFIG` / `MAINNET_CONFIG` from the SDK.

### C18. LOW - `deployLedger` constants in indexer config are stale
- **File:** `webapp/packages/indexer/src/config.ts:22`
- **What:** Hardcoded `1819978`. The actual current testnet deploy of `CDGNYED4...` was at a later ledger (per `01d588b chore: redeploy contracts...`).
- **Why it matters:** Cold-start indexer rescans a wrong starting range. Live indexer is unaffected because `indexer_state` cursor wins, but a reindex from scratch would over-scan.
- **Fix:** Update to the actual deploy ledger of the latest deploy, or remove the constant entirely and require the env var.

### C19. LOW - Cursor monotonicity not enforced
- **File:** `webapp/packages/indexer/src/indexer.ts:159-246` (the per-batch ledger advance)
- **What:** Code assumes `event.ledger >= maxLedger` always. RPC failure / partial pagination could return events out of order.
- **Why it matters:** Edge case, unlikely in practice with Stellar RPC.
- **Fix:** Assert and skip if violated. Log a structured warning.

---

## D. Infrastructure, CI, Deploy

### D1. HIGH - Mainnet WASM hash verification was inconclusive
- **File:** Plan history (mainnet contracts at `CCSMX3YEK...`, `CCIZJXEVL...`, `CAI3ZKBNX...`)
- **What:** During the merge, we confirmed function-list and `contractmeta!` parity but **not** byte-identical WASM. The mismatch was attributed to different Rust nightly versions.
- **Why it matters:** "Same function shapes" is necessary but not sufficient. A subtle compiler-version-induced behavior change (e.g., different overflow semantics in a const-fn evaluated at compile time) could ship to mainnet without us noticing. The user has been told the contracts match, so any divergence becomes a credibility issue.
- **Fix:** Either rebuild on the exact Rust version that produced the deployed WASM (extract it from the `_metadata` section if `contractmeta!` records it), or redeploy from our build and rotate the addresses in the SDK config.

### D2. MEDIUM - Docker compose mounts the docker socket into vector
- **File:** `webapp/docker/docker-compose.supabase.yml` (the `vector` service block)
- **What:** Read-only mount of `/var/run/docker.sock` for log collection. The compose file itself acknowledges this is a security risk in a comment.
- **Why it matters:** A vector-container compromise becomes a host compromise via Docker API enumeration.
- **Fix:** Use `tecnativa/docker-socket-proxy` between vector and the docker socket, allowlisting only the read endpoints vector actually needs (`/containers/json`, `/containers/{id}/logs`).

### D3. MEDIUM - Deploy workflow uses paths-based trigger that is fragile after the merge
- **File:** `.github/workflows/deploy-webapp-vps.yml`
- **What:** The workflow has `paths:` triggers prefixed with `webapp/...`. This is correct after the subtree merge, but the prefixing is silently brittle: any new top-level path added under `webapp/` (e.g. a new package) needs to be added to the trigger list manually or the deploy won't fire.
- **Fix:** Either use a single broad trigger `paths: ['webapp/**']` or document the requirement that new paths must be added to the trigger.

### D4. LOW - `.env.example` shows defaults that survive into production
- **File:** `webapp/docker/.env.example`
- **What:** Defaults like `POSTGRES_PASSWORD=CHANGE_ME` rely on the operator actually changing them. If someone copies `.env.example` to `.env` and edits only the obvious fields (passwords, JWT), they may miss `LOGFLARE_*_ACCESS_TOKEN`, `S3_PROTOCOL_ACCESS_KEY_*`, etc.
- **Fix:** Replace `CHANGE_ME` with `<<REQUIRED>>` and have the migrate container fail fast if any value still equals `<<REQUIRED>>`.

### D5. LOW - CI workflow caches pnpm store but does not pin pnpm version anywhere except `package.json`
- **File:** `.github/workflows/ci.yml` (the new webapp job)
- **What:** `pnpm/action-setup@v4` with `version: 10`. The `package.json` `packageManager` field also says 10. If they ever drift, you get pnpm-version-induced lockfile churn.
- **Fix:** Have the action read the version from `package.json` (action-setup supports this).

---

## E. Cross-cutting / Doc / Process

### E1. MEDIUM - No automated test for end-to-end indexer + contract roundtrip
- **What:** Rust tests cover contract behavior in isolation. SDK tests are unit tests against mocks. There is no test that does: register agent on testnet -> wait for indexer to pick it up -> query the API -> assert the right data appears.
- **Why it matters:** The whole stack has many seams (contract -> RPC -> indexer parser -> DB schema -> API view -> SDK explorer client -> frontend). Each seam has known bugs above. Without an end-to-end test, regressions in a future change are caught by users, not CI.
- **Fix:** Add a CI job that runs a containerized Soroban testnet stub + the indexer + a test PostgreSQL, registers an agent, gives feedback, requests validation, and asserts the explorer API returns the expected shapes. Long, but a one-time investment.

### E2. MEDIUM - No documented contract upgrade path
- **What:** Contracts are upgradeable via `Ownable` two-step. There is no doc explaining who holds the admin key, where the key is stored, what the upgrade procedure is, or whether there's a public timelock window.
- **Why it matters:** Anyone trusting the contracts (off-chain protocol consumers, future cross-chain bridges) needs this. The upgrade key is an effective backdoor; users should know its policy.
- **Fix:** Document in the repo root readme: admin key, custody, upgrade procedure, timelock (or "no timelock - this is a known centralization point").

### E3. MEDIUM - Two `.gitignore` policies (root and webapp/) silently fight
- **What:** Root `.gitignore` has 7 lines. `webapp/.gitignore` has its own rules including `*.md` which excludes most markdown files. After the subtree merge they layer correctly (hierarchical .gitignore), but the layering is not obvious to a new contributor. Adding a top-level rule that conflicts will produce confusing "why isn't this file tracked?" debugging sessions.
- **Fix:** Add a brief comment to the root `.gitignore` explaining the hierarchical layering.

### E4. LOW - Webapp `CLAUDE.md` and parent `CLAUDE.md` are different roles
- **File:** parent `CLAUDE.md` (us, "engineer"), `webapp/CLAUDE.md` (yaman's "Planner role" - see the system reminder fired earlier in this session)
- **What:** Two different CLAUDE.md files with different role definitions. A future agent run inside `webapp/` will pick up yaman's planner role, which has different commit conventions, different terminology, and a different pipeline (`U-A-P-C-B-I-V-C` vs our flat dev cycle). They will not produce work the parent project will accept.
- **Fix:** Either merge the role definitions or have the parent `CLAUDE.md` explicitly carve out `webapp/` as a different namespace and delegate. **The cheap fix is a one-line note in parent `CLAUDE.md`** saying "do not adopt the webapp/CLAUDE.md role when working from the parent".

### E5. LOW - Conventional commit prefix discipline is mixed
- **What:** A grep of recent commits shows mostly `fix:`, `chore:`, `feat:`, but some legacy yaman commits use `feat:` for what should have been `fix:` (security patches labeled as features). Going forward, we should hold the line. This is just a "watch for it in PR review" note.
- **Fix:** Nothing to change in code. Add a note to PR review checklist.

---

## F. Findings I dropped (verified false or overstated)

These were reported by the parallel agents. I checked and they don't hold up:

1. **"Rate limit off-by-one allowing 31 requests"** - Re-read of `webapp/supabase/functions/api/lib/rate-limit.ts:25-29` shows `count <= 30` correctly allows exactly 30. The real bug is the concurrency race (C4), not off-by-one.
2. **"`buildMetadataJsonForEdit` shadows `name`/`description` with non-string preserved values"** - Re-read of `webapp/packages/sdk/src/core/metadata.ts:48-70` shows `KNOWN_FIELDS` filters those fields out of `preserved`, so shadowing is impossible. The actual bug at this site is the silent legacy `endpoints` drop (B4), which the agent missed.
3. **"TTL constants comment is wrong (518400 seconds / 5 = 6 days, not 30)"** - `518400` is in **ledgers**, not seconds. 518400 ledgers x 5 s/ledger = 30 days. The comment is correct (A13).
4. **"Freighter signer override is HIGH severity"** - Mitigated by Freighter's UI confirmation popup which displays the address being signed. Downgraded to LOW (B11).
5. **"i128 -> numeric(78,0) historical data was truncated"** - PostgreSQL would have rejected the inserts (rollback with overflow error), not silently truncated. The downstream effect is the same (events lost in the DB) but the root cause is different and the fix is the backfill audit, not data repair (C1).

---

## G. Triage recommendation

**Done so far (in commit order, most recent last):**
- A5 - `77c1ac7` checked arithmetic in aggregate updates
- B1+B2 - `08e32c7` accept contract addresses
- A14 - `d7775d3` find_owner panic guard (with cross-contract propagation in reputation+validation)
- A2 - `ba7e953` extend OZ NFT base storage TTL (Owner+Balance)
- A3+A4 - `e7dfd7c` extend reputation+validation persistent TTL on every read and write
- C7 - `610d2e7` add lock_timeout to insert_feedback_response
- A7 - `35d9dba` cap metadata key (64) and value (4096) lengths
- C8+C15 - `96044e2` validations.tag length constraint, index, search_agents grant
- B7 - `244a51c` add noreferrer to external explorer links
- C2 - `fe98496` JSON size cap + SSRF guard in resolveUri/parseDataUri
- A1+A6 - `accfb26` metadata key index, extend on read, clear on transfer
- A9 - `72d2159` checked_add on counter increments (reputation+validation)
- C14 - `1b5f83b` drop URI/hash columns from realtime publication

**Open, in priority order:**

1. **C5 (backfill / indexer concurrent races)** - operationally important.
2. **C6 (Kong auth header logging)** - verify access log format first.
3. **A8 (`get_summary` with explicit clients is O(n*m))** - cap the input list.
4. **C1 (feedback historical data audit)** - one-shot backfill diff.
5. **B3 (form-level address validation audit)** - enumerate forms.
6. **B4 (legacy endpoints field drop)** - depends on whether any legacy agents still exist.
7. **A10 (cross-contract trust documentation)** - rustdoc + upgrade-timelock decision.
8. **A15 (architecture plan vs code divergence)** - rewrite or delete the stale plan.
9. **C-series MEDIUM/LOW backlog** - C9, C10, C11, C12, C13, C16-C19.
10. **D-series infrastructure** - D1-D5.
11. **E-series cross-cutting** - E1-E5.
12. **B-series LOW** - B5, B6, B8 through B15.

**Quick wins still open (under 30 min each):** B11, B12, B14, C16, C17, C18, C19.

**Medium effort still open (under a day):** B4, B5, B6, B8, B9, B10, B13, C9, C10, C11, C12, C13, D2, D3, D4, D5.

**Bigger projects (multi-day):** A8 (per-client aggregates), B3 (form audit), C1 (historical data audit), C5 (backfill concurrency), D1 (mainnet WASM verify), E1 (e2e CI test), E2 (upgrade docs).

## H. Verification approach per finding

For each individual finding, the verification approach is in-line in the finding description (test ledger fast-forward for A2/A3/A4, integration test for B1/B2, fuzz test for A5, log inspection for C6, backfill diff for C1, etc).

This document is a working artifact; it should be updated as findings get fixed (mark them DONE inline) or shown to be wrong (move to section F).
