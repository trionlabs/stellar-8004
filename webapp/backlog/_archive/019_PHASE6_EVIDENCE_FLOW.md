# 019 - FeedbackForm: Evidence Chain (SHA-256 + IPFS)

**Status:** DONE
**Owner:** Codex
**Phase:** 6 - Protocol Compliance
**Branch:** `feat/evidence-flow`
**Depends On:** 017
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [docs/plans/019-phase6-evidence-flow-critic.md](../docs/plans/019-phase6-evidence-flow-critic.md)

## Context

FeedbackForm currently generates a random hash via `crypto.getRandomValues(new Uint8Array(32))` and passes an empty string as `feedbackUri`. This breaks ERC-8004's core trust mechanism, the evidence chain. Spec: "feedbackURI: a file URI pointing to an off-chain JSON", "We suggest using IPFS or equivalent services."

**Hash algorithm note:** SHA-256 is a design choice of the trionlabs Stellar contracts - ERC-8004 spec specifies keccak-256 for EVM. Our Stellar implementation uses SHA-256. When an IPFS URI is used the spec makes feedbackHash optional, but we still include it (best practice).

**Current problem:** Random hash + empty URI = unverifiable feedback = contradicts the protocol's purpose.

## File Scope

- Create: `apps/web/src/lib/evidence.ts`
- Create: `apps/web/src/lib/server/ipfs.ts` (SERVER-SIDE ONLY - JWT must not reach the browser)
- Create: `apps/web/src/routes/api/ipfs-upload/+server.ts` (server endpoint)
- Modify: `apps/web/src/lib/components/FeedbackForm.svelte`
- Modify: `.env.example`

## Requirements

- [ ] `evidence.ts`: `buildFeedbackEvidence(params)` - build a spec-aligned evidence JSON
- [ ] `evidence.ts`: `sha256Hash(content)` - compute hash via `crypto.subtle.digest('SHA-256', ...)`
- [ ] `server/ipfs.ts`: `uploadEvidence(name, data)` - upload to IPFS via the Pinata API, return `ipfs://{CID}` (**SERVER-SIDE ONLY**)
- [ ] `routes/api/ipfs-upload/+server.ts`: POST endpoint - client posts evidence JSON, server uploads to Pinata and returns the CID
- [ ] In FeedbackForm: build evidence -> SHA-256 hash -> POST to `/api/ipfs-upload` -> send to the contract as `feedbackUri` + `feedbackHash`
- [ ] Remove all `crypto.getRandomValues` usage
- [ ] IPFS upload is optional (on failure continue with an empty URI, but the hash is still derived from real evidence)
- [ ] **SECURITY:** `PINATA_JWT` is a PRIVATE env variable (`$env/static/private` or `$env/dynamic/private`) - DO NOT use a `PUBLIC_` prefix
- [ ] Alternative pattern: Pinata V3 presigned URL (server generates a signed URL, client uploads to Pinata directly - more efficient)

## Implementation Plan

Follow Task 019 in the plan (Detailed Tasks section) verbatim. The code lives in steps 1-5 of `docs/plans/2026-04-05-protocol-compliance-and-discovery.md`.

### Steps:
1. Create `evidence.ts` (builder + hash utility)
2. Create `server/ipfs.ts` (Pinata upload helper - SERVER-SIDE ONLY)
3. Create `routes/api/ipfs-upload/+server.ts` (POST endpoint - the client's IPFS upload routes through here)
4. Update FeedbackForm (evidence flow - IPFS upload via `/api/ipfs-upload`)
5. Add `PINATA_JWT` to `.env.example` (**NO `PUBLIC_` prefix**)
6. Commit

### Commit:
```bash
git add apps/web/src/lib/evidence.ts apps/web/src/lib/server/ipfs.ts apps/web/src/routes/api/ipfs-upload/+server.ts apps/web/src/lib/components/FeedbackForm.svelte
git commit -m "feat(web): real evidence chain in FeedbackForm (SHA-256 + IPFS upload)"
```

## Verification

- [ ] FeedbackForm submit builds an evidence JSON (verify via console.log)
- [ ] SHA-256 hash is computed (no random hash)
- [ ] Successful IPFS upload -> returns an `ipfs://Qm...` URI
- [ ] Failed IPFS upload -> graceful fallback (empty URI but real hash)
- [ ] On-chain feedback stores `feedbackUri` and `feedbackHash` with the correct values
- [ ] App does not crash without `PINATA_JWT` (upload is skipped)
- [ ] Pinata JWT is not exposed in the browser (not visible in Network tab headers)
