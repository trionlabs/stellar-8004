# 020 - Metadata Format Spec Alignment (Documentation)

**Status:** DONE
**Owner:** Codex
**Phase:** 6 - Protocol Compliance
**Branch:** `feat/metadata-spec`
**Depends On:** -
**Plan:** [docs/plans/2026-04-05-protocol-compliance-and-discovery.md](../docs/plans/2026-04-05-protocol-compliance-and-discovery.md)
**Critic:** [docs/plans/020-phase6-metadata-spec-critic.md](../docs/plans/020-phase6-metadata-spec-critic.md)

## Context

The current agent metadata format diverges from the ERC-8004 spec:
- `type` field is `"Agent"` -> spec expects `"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`
- `endpoints` field uses `[{type, url}]` -> spec format is `services: [{name, endpoint, version}]`
- `supportedTrust` field is missing or wrongly structured
- **Valid `supportedTrust` values per spec:** `"reputation"`, `"crypto-economic"`, `"tee-attestation"` (not a closed enum but these are the spec examples). The previous plan used "validation" and "tee" - both wrong.
- **Hash note:** ERC-8004 spec specifies keccak-256 for EVM. Our Stellar implementation uses SHA-256 (trionlabs design choice). Hash is optional for IPFS URIs (per spec).

This task only produces documentation. The actual metadata update will happen in Task 027 (CLI update-metadata).

## File Scope

- Create: `docs/findings/8004/metadata-format-guide.md`

## Requirements

- [ ] Old format -> new format field mapping table
- [ ] Spec references (EIP-8004 section links)
- [ ] `type` field: `"Agent"` -> `"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`
- [ ] `endpoints` -> `services` conversion rules
- [ ] `supportedTrust` array structure and valid values (spec examples: `"reputation"`, `"crypto-economic"`, `"tee-attestation"` - not a closed enum, but spec terminology must be followed)
- [ ] **WARNING:** Plan/backlog used "validation" and "tee" - those are NOT spec-compliant. Correct values: `"crypto-economic"` (not "validation"), `"tee-attestation"` (not "tee")
- [ ] Example metadata JSON (old and new format)
- [ ] Reference to the CLI update-metadata script (Task 027)

## Implementation Plan

1. Create the `docs/findings/8004/` directory if missing
2. Write `metadata-format-guide.md`
3. Commit

### Commit:
```bash
git add docs/findings/8004/metadata-format-guide.md
git commit -m "docs: ERC-8004 metadata format alignment guide"
```

## Verification

- [ ] Documentation clearly explains the differences between the old and new formats
- [ ] Spec references are accurate and current
- [ ] Example JSONs are valid and spec-compliant
