# ERC-8004 Metadata Format Alignment Guide

Reference: [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) | Stellar contracts: [trionlabs/stellar-8004](https://github.com/trionlabs/stellar-8004)

## Overview

This document maps the differences between the current (legacy) metadata format used by 8004scan Stellar agents and the ERC-8004 spec-compliant format. The actual metadata update will be performed via CLI in Task 027 (`update-metadata`).

## Field Mapping

| Field | Legacy Format | Spec-Compliant Format | Notes |
|-------|--------------|----------------------|-------|
| `type` | `"Agent"` | `"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"` | Protocol identifier URI, not Ethereum-specific |
| `endpoints` | `[{type, url}]` | *removed* | Replaced by `services` |
| `services` | *missing* | `[{name, endpoint, version}]` | Spec format for service discovery |
| `supportedTrust` | *missing or incorrect* | `["reputation"]` | See valid values below |

## `type` Field

The `type` field is a protocol identifier URI, not an indication of Ethereum dependency. The same URI is used across all ERC-8004 implementations (Ethereum, Stellar, etc.):

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"
}
```

## `services` Array

### Legacy Format (`endpoints`)

```json
{
  "endpoints": [
    { "type": "MCP", "url": "https://agent.example.com/mcp" },
    { "type": "A2A", "url": "https://agent.example.com/a2a" }
  ]
}
```

### Spec Format (`services`)

```json
{
  "services": [
    { "name": "MCP", "endpoint": "https://agent.example.com/mcp", "version": "0.3.0" },
    { "name": "A2A", "endpoint": "https://agent.example.com/a2a", "version": "1.0.0" }
  ]
}
```

### Migration Rules

| Legacy Field | Spec Field | Fallback |
|-------------|-----------|----------|
| `endpoints[i].type` | `services[i].name` | `"unknown"` |
| `endpoints[i].url` | `services[i].endpoint` | *required, skip if empty* |
| *(not present)* | `services[i].version` | `undefined` |

If both `endpoints` and `services` are present, `services` takes precedence.

## `supportedTrust` Array

Spec examples (not a closed enum, but spec terminology should be followed):

| Value | Meaning |
|-------|---------|
| `"reputation"` | Participates in reputation registry |
| `"crypto-economic"` | Crypto-economic trust mechanisms |
| `"tee-attestation"` | TEE attestation support |

**Common mistakes:**
- ~~`"validation"`~~ -> use `"crypto-economic"`
- ~~`"tee"`~~ -> use `"tee-attestation"`

For our Phase 2 agents, the correct value is `["reputation"]` since they participate in the reputation registry.

## Hash Algorithm Note

- ERC-8004 spec specifies **keccak-256** for EVM implementations
- Stellar implementation (trionlabs) uses **SHA-256** - this is a design decision by the contract authors, not a spec violation
- When using IPFS URIs, `feedbackHash` is optional per spec, but we include it as best practice

## Complete Spec-Compliant Metadata Example

### Before (Legacy)

```json
{
  "type": "Agent",
  "name": "ExampleAgent",
  "description": "An example AI agent on Stellar",
  "image": "ipfs://QmExample...",
  "endpoints": [
    { "type": "MCP", "url": "https://agent.example.com/mcp" }
  ]
}
```

### After (Spec-Compliant)

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "ExampleAgent",
  "description": "An example AI agent on Stellar",
  "image": "ipfs://QmExample...",
  "services": [
    { "name": "MCP", "endpoint": "https://agent.example.com/mcp", "version": "0.3.0" }
  ],
  "supportedTrust": ["reputation"]
}
```

## Validation

A JSON Schema for metadata validation is available at [`metadata-schema.json`](./metadata-schema.json). This can be used by the indexer, CLI tools, or external validators.

## Related Tasks

- **Task 018** - URI resolver extracts `services` and `supportedTrust` from metadata
- **Task 027** - CLI `update-metadata` script updates all 10 agents' metadata on-chain
