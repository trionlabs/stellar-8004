# ERC-8004 Metadata Format

Reference: [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) | Stellar contracts: [trionlabs/stellar-trustless-agents](https://github.com/trionlabs/stellar-trustless-agents)

## Overview

This document defines the ERC-8004 spec-compliant metadata format for Stellar agents and how to migrate from the older `endpoints`-based format some early agents shipped with.

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

An agent that participates in the reputation registry should declare `["reputation"]` at minimum.

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

A JSON Schema for metadata validation lives alongside this guide at [`schema.json`](./schema.json). It can be used by the indexer, CLI tools, or external validators.
