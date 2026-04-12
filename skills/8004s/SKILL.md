---
name: 8004s
description: Use when building on Stellar/Soroban with ERC-8004 Agent Trust Protocol — agent identity registration, reputation feedback, validator endorsements.
---

# ERC-8004: Agent Trust Protocol on Stellar

ERC-8004 establishes trust infrastructure for autonomous AI agents on Stellar/Soroban, enabling them to discover, identify, and evaluate other agents across organizational boundaries.

> **Companion skill:** `/stellar-dev` for Soroban transaction patterns, Freighter integration, `nativeToScVal` reference, and testnet setup.

## When to Use

- Registering an AI agent's identity on-chain so it becomes discoverable
- Building reputation systems for AI agents (feedback, scoring, trust thresholds)
- Verifying agent identity and reputation before interacting or paying
- Querying agent reputation and feedback history
- Implementing trust-based agent interactions with x402 payments

## The Protocol Stack

```
Application Layer    (Agent apps, marketplaces, 8004scan)
        ↓
Trust Layer          (ERC-8004: identity + reputation + validation) ← this skill
        ↓
Payment Layer        (x402: USDC micropayments) ← /x402s skill
        ↓
Communication Layer  (A2A, MCP, HTTP)
```

ERC-8004 sits at the **Trust Layer** — you verify trust first, then enable payment, then communicate. Without trust, agents can't evaluate each other before transacting.

## Contract Addresses

### Stellar Testnet

| Contract | Address |
|----------|---------|
| Identity Registry | `CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH` |
| Reputation Registry | `CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55` |
| Validation Registry | `CC5USZRO26MOIAVNYTTJDS63C2OBBLREOAOET4CPF2EZWO3YFKLMO3SL` |

### Stellar Mainnet

| Contract | Address |
|----------|---------|
| Identity Registry | `CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35` |
| Reputation Registry | `CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA` |
| Validation Registry | `CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG` |

### Network Configuration

| Network | RPC URL | Passphrase |
|---------|---------|------------|
| Testnet | `https://soroban-testnet.stellar.org` | `Test SDF Network ; September 2015` |
| Mainnet | `https://mainnet.sorobanrpc.com` | `Public Global Stellar Network ; September 2015` |

## Prerequisites

```bash
npm install @trionlabs/8004-sdk @stellar/stellar-sdk
```

- Stellar keypair (G.../S... format) — `Keypair.random()` for testnet, `Keypair.fromSecret(secret)` for existing wallets
- Signer — `wrapBasicSigner(keypair, networkPassphrase)` for scripts, `FreighterSigner` for browser apps
- Testnet: fund via `fundTestnet(address)` from SDK or [Friendbot](https://friendbot.stellar.org?addr=YOUR_KEY)
- Companion skill `/stellar-dev` for Soroban transaction fundamentals

## Step 1: Prepare Your Agent Metadata

### Metadata Format

Host as IPFS, HTTPS, or inline data URI — passed to `register_with_uri()`:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "My AI Agent",
  "description": "What your agent does",
  "image": "https://example.com/agent-logo.png",
  "services": [
    { "name": "x402", "endpoint": "https://your-agent.example.com/task", "version": "1.0" },
    { "name": "mcp", "endpoint": "https://your-agent.example.com/mcp" },
    { "name": "a2a", "endpoint": "https://your-agent.example.com/.well-known/agent.json" }
  ],
  "supportedTrust": ["reputation", "validation"],
  "x402": true
}
```

**Required fields:**
- `type` — must contain `eip-8004` or `registration-v1`
- `name` — non-empty string

### Service Types

| Service | Purpose | Endpoint Format |
|---------|---------|----------------|
| `x402` | HTTP API with USDC micropayments | `https://agent.example.com/task` |
| `mcp` | Model Context Protocol server | `https://agent.example.com/mcp` |
| `a2a` | Agent-to-Agent protocol | `https://agent.example.com/.well-known/agent.json` |
| custom | Any other protocol (e.g. `rest`, `oasf`, `xmtp`) | Your URL |

Service types affect discoverability — the explorer filters by `hasServices` and `x402`.

### Hosting Your Metadata

| Method | When to Use | Limit |
|--------|-------------|-------|
| Data URI | Simple agents, under 8KB | `data:application/json;base64,...` |
| IPFS | Immutable metadata | `ipfs://Qm...` |
| HTTPS | Mutable, updateable metadata | `https://your-server.com/agent.json` |

### Using the SDK

```typescript
import { buildMetadataJson, toDataUri, validateMetadataJson } from '@trionlabs/8004-sdk';

const metadata = buildMetadataJson({
  name: 'My AI Agent',
  description: 'Summarizes documents and answers questions',
  imageUrl: 'https://example.com/logo.png',
  services: [
    { name: 'x402', endpoint: 'https://my-agent.example.com/task', version: '1.0' },
    { name: 'mcp', endpoint: 'https://my-agent.example.com/mcp' },
  ],
  supportedTrust: ['reputation'],
  x402Enabled: true,
});

// Validate before registering (throws on invalid metadata)
validateMetadataJson(metadata);

// Convert to data URI (fails if > 8KB)
const dataUri = toDataUri(metadata);
```

### Common Metadata Mistakes

| Mistake | Consequence |
|---------|-------------|
| Missing `type` field | Indexer cannot categorize; agent may not appear in filtered searches |
| Missing `name` | Agent shows as unnamed in explorer |
| Data URI > 8KB | Transaction fails — use IPFS or HTTPS instead |
| Unreachable HTTPS URL | Indexer retries exhaust (5 attempts); agent stuck as unresolved |
| Empty `endpoint` in service | Service silently dropped by URI resolver |

## Step 2: Register On-Chain

### Using the SDK (recommended)

```typescript
import { Keypair } from '@stellar/stellar-sdk';
import { createClients, TESTNET_CONFIG, wrapBasicSigner } from '@trionlabs/8004-sdk';

// Create a signer from a Stellar secret key (S-format)
const keypair = Keypair.fromSecret(process.env.STELLAR_SECRET_KEY!);
const signer = wrapBasicSigner(keypair, TESTNET_CONFIG.networkPassphrase);
const { identity } = createClients(TESTNET_CONFIG, signer);

// Register with metadata URI (recommended)
const tx = await identity.register_with_uri({
  caller: keypair.publicKey(),
  agent_uri: dataUri,  // from Step 1
});
const sent = await tx.signAndSend();
const agentId = sent.result;  // u32 — save this, it's your agent's permanent ID

// Or register with URI + metadata in one call
const tx2 = await identity.register_full({
  caller: keypair.publicKey(),
  agent_uri: dataUri,
  metadata: [{ key: 'category', value: new TextEncoder().encode('defi') }],
});
const sent2 = await tx2.signAndSend();
const agentId2 = sent2.result;
```

### Without the SDK

All contract calls use `buildAndSign()` from `references/build-and-sign.ts` (simulate → assemble → sign → poll).

```typescript
import * as StellarSdk from '@stellar/stellar-sdk';

// Register with URI
const args = [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),
  StellarSdk.nativeToScVal(dataUri, { type: 'string' }),
];
const { hash, result } = await buildAndSign('register_with_uri', IDENTITY_REGISTRY, args, signerAddress, signFn, rpc, networkPassphrase);
const agentId = StellarSdk.scValToNative(result) as number;

// Register minimal (no URI — agent won't be discoverable until URI is set)
const { result } = await buildAndSign('register', IDENTITY_REGISTRY, [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),
], signerAddress, signFn, rpc, networkPassphrase);

// Register with URI + batch metadata
const metadataVec = StellarSdk.nativeToScVal(
  [{ key: 'category', value: Buffer.from('defi') }],
  { type: { vec: { map: { key: 'string', value: 'bytes' } } } },
);
await buildAndSign('register_full', IDENTITY_REGISTRY, [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),
  StellarSdk.nativeToScVal(dataUri, { type: 'string' }),
  metadataVec,
], signerAddress, signFn, rpc, networkPassphrase);
```

### Updating Your Agent

```typescript
// Update metadata URI (triggers re-indexing)
await buildAndSign('set_agent_uri', IDENTITY_REGISTRY, [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),  // caller
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal('ipfs://QmNewMetadata...', { type: 'string' }),
], signerAddress, signFn, rpc, networkPassphrase);

// Set on-chain key-value metadata
await buildAndSign('set_metadata', IDENTITY_REGISTRY, [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal('category', { type: 'string' }),      // max 64 bytes
  StellarSdk.nativeToScVal(Buffer.from('defi'), { type: 'bytes' }), // max 4KB
], signerAddress, signFn, rpc, networkPassphrase);

// Set agent wallet — BOTH caller and wallet must authorize (dual require_auth)
await buildAndSign('set_agent_wallet', IDENTITY_REGISTRY, [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),   // caller (owner)
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(walletAddress, { type: 'address' }),   // new wallet
], signerAddress, signFn, rpc, networkPassphrase);

// Read helpers (simulate only, no signing needed)
// agent_uri(agent_id) → Result<String>
// get_metadata(agent_id, key) → Option<Bytes>
// get_agent_wallet(agent_id) → Option<Address>
// find_owner(agent_id) → Option<Address>
// agent_exists(agent_id) → bool
// total_agents() → u32
```

### Extending TTL (Preventing Data Archival)

Soroban data expires if not extended. Call `extend_ttl` periodically to keep your agent's data alive:

```typescript
await buildAndSign('extend_ttl', IDENTITY_REGISTRY, [
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
], signerAddress, signFn, rpc, networkPassphrase);
```

This extends TTL for: agent URI, wallet, all metadata keys + values, NFT owner, and owner balance. Without this, archived agents become invisible to on-chain reads.

## Step 3: Get Indexed and Discovered

### What Happens After Registration

```
1. You call register_with_uri() → Registered event emitted on-chain
2. Indexer detects event → creates agent record (resolve_uri_pending = true)
3. resolve-uris edge function runs every 30 seconds
4. Fetches your metadata URL → parses services, trust settings
5. Exponential backoff retry: 2, 4, 8, 16, 32 minutes (max 5 attempts)
6. On success: agent becomes searchable and visible in explorer
7. Your agent page: https://stellar8004.com/agents/{agentId}
```

### Verify Your Registration

```typescript
import { ExplorerClient } from '@trionlabs/8004-sdk';

const explorer = new ExplorerClient(); // defaults to mainnet explorer
const agent = await explorer.getAgent(agentId);
console.log(agent.name, agent.services, agent.totalScore);

// Or check if your agents are listed
const myAgents = await explorer.getAgentsByAddress(myAddress);
```

### Explorer API

| Endpoint | Query Params | Returns |
|----------|-------------|---------|
| `GET /api/v1/agents` | `page`, `limit`, `trust`, `minScore`, `hasServices`, `x402`, `sortBy` | Paginated agent list with scores |
| `GET /api/v1/agents/{id}` | — | Single agent with full details |
| `GET /api/v1/agents/{id}/feedback` | `page`, `limit`, `tag` | Paginated feedback entries |
| `GET /api/v1/search?q=...` | `q` (required), `limit`, `trust`, `minScore` | Full-text search results |
| `GET /api/v1/stats` | — | Registry statistics (totalAgents, totalFeedbacks, etc.) |
| `GET /api/v1/accounts/{address}/agents` | `page`, `limit` | Agents owned by address |

Base URL: `https://stellar8004.com`. Rate limit: 30 requests per IP.

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Agent not appearing | Metadata URL unreachable from indexer | Ensure URL is publicly accessible (no localhost, no private IPs) |
| Services not showing | Empty `endpoint` in service entry | Verify each service has a non-empty endpoint |
| Still "indexing" after 30 min | All 5 retry attempts failed | Call `set_agent_uri` with corrected URL to trigger re-resolution |
| Agent shows as unnamed | Missing `name` in metadata | Update metadata JSON and call `set_agent_uri` |

## Step 4: Reputation — Give and Read Feedback

### Why Reputation Matters

Reputation is the core of trust between agents:
- **Trust before payment** — check an agent's score before paying for its services via x402
- **Sybil resistance** — `get_summary` accepts a filtered client list, letting you weight trusted sources
- **Discoverability** — higher-scoring agents rank higher in the explorer (Total Score = Avg Feedback × 0.6 + Volume Factor × 0.2)
- **Accountability** — agents can respond to feedback on-chain via `append_response`

### Score Calculation

```
Total Score = (Average Feedback × 0.6) + (Volume Factor × 0.2)
Volume Factor = min(100, log(feedbackCount) / log(100) × 100)
```

More feedback from more unique clients = higher score = better discoverability.

### give_feedback

Self-feedback is blocked. `value` is `i128` (supports negative). `value_decimals` max 18.

```typescript
// Create feedback hash (SHA-256)
const content = JSON.stringify({ quality: 'excellent', latency: '200ms' });
const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));

const args = [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),   // caller (client)
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),             // agentId
  StellarSdk.nativeToScVal(BigInt(85), { type: 'i128' }),         // value (0-100 scale)
  StellarSdk.nativeToScVal(0, { type: 'u32' }),                   // valueDecimals
  StellarSdk.nativeToScVal('starred', { type: 'string' }),        // tag1 (max 64 chars)
  StellarSdk.nativeToScVal('', { type: 'string' }),               // tag2
  StellarSdk.nativeToScVal('https://agent.example.com', { type: 'string' }), // endpoint
  StellarSdk.nativeToScVal('', { type: 'string' }),               // feedbackUri
  StellarSdk.nativeToScVal(new Uint8Array(hashBuf), { type: 'bytes' }),       // feedbackHash
];
await buildAndSign('give_feedback', REPUTATION_REGISTRY, args, signerAddress, signFn, rpc, networkPassphrase);
```

> **Storage note:** Only `value`, `value_decimals`, `is_revoked`, `tag1`, `tag2` are stored on-chain. The `endpoint`, `feedback_uri`, and `feedback_hash` are emitted as event data only — to read them later, use the explorer API or parse events.

### revoke_feedback

Revokes feedback you previously gave. Only the original feedback author can revoke.

```typescript
await buildAndSign('revoke_feedback', REPUTATION_REGISTRY, [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),   // caller (original client)
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(BigInt(1), { type: 'u64' }),           // feedbackIndex (1-indexed)
], signerAddress, signFn, rpc, networkPassphrase);
```

### append_response

Agent owner can respond to feedback on-chain. Multiple responses per feedback allowed.

```typescript
const responseContent = JSON.stringify({ reply: 'Thank you for the feedback, we improved latency.' });
const responseHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(responseContent));

await buildAndSign('append_response', REPUTATION_REGISTRY, [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),       // caller (agent owner)
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(clientAddress, { type: 'address' }),       // feedback author
  StellarSdk.nativeToScVal(BigInt(1), { type: 'u64' }),               // feedbackIndex
  StellarSdk.nativeToScVal('https://response.example.com', { type: 'string' }), // responseUri
  StellarSdk.nativeToScVal(new Uint8Array(responseHashBuf), { type: 'bytes' }), // responseHash
], signerAddress, signFn, rpc, networkPassphrase);
```

### read_feedback

Reads a single feedback entry. Returns stored fields only (not event-only fields like endpoint or feedbackUri).

```typescript
const args = [
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(clientAddress, { type: 'address' }),
  StellarSdk.nativeToScVal(BigInt(1), { type: 'u64' }),  // feedbackIndex (1-indexed)
];

const { result } = await buildAndSign('read_feedback', REPUTATION_REGISTRY, args, signerAddress, signFn, rpc, networkPassphrase);
const feedback = StellarSdk.scValToNative(result);
// Returns FeedbackData:
// {
//   value: i128,           — the feedback score
//   value_decimals: u32,   — decimal precision
//   is_revoked: bool,      — whether revoked
//   tag1: string,          — primary tag
//   tag2: string,          — secondary tag
// }
```

### get_summary — Running Aggregates

Returns aggregated reputation across multiple clients. **No stored aggregates** — the contract iterates all feedback on every call.

```typescript
const args = [
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(clientAddresses, { type: { vec: 'address' } }), // max 5 clients
  StellarSdk.nativeToScVal('starred', { type: 'string' }),  // tag1 filter ('' = all)
  StellarSdk.nativeToScVal('', { type: 'string' }),         // tag2 filter ('' = all)
];

const { result } = await buildAndSign('get_summary', REPUTATION_REGISTRY, args, signerAddress, signFn, rpc, networkPassphrase);
const summary = StellarSdk.scValToNative(result);
// Returns SummaryResult:
// {
//   count: u64,                    — number of matching feedback entries
//   summary_value: i128,           — WAD-normalized average score
//   summary_value_decimals: u32,   — mode decimal precision (most common)
// }
```

**Performance characteristics:**
- `MAX_SUMMARY_CLIENTS = 5` — contract limits to 5 client addresses per call
- Complexity: O(clients × feedbacks_per_client) — iterates all non-revoked feedback
- Filters by `tag1` and `tag2` (empty string = no filter)
- Revoked feedback is excluded automatically
- **Sybil best practice:** pass a curated list of trusted client addresses, not all clients

### get_clients_paginated

Paginated list of addresses that have given feedback to an agent. Soroban per-tx budget caps arrays at ~100 entries.

```typescript
const args = [
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(0, { type: 'u32' }),    // start index
  StellarSdk.nativeToScVal(20, { type: 'u32' }),   // limit
];

const { result } = await buildAndSign('get_clients_paginated', REPUTATION_REGISTRY, args, signerAddress, signFn, rpc, networkPassphrase);
const clients = StellarSdk.scValToNative(result) as string[];
```

### get_last_index and get_response_count

```typescript
// Get the latest feedback index for a specific client
// Returns u64 — the highest feedback_index this client has given to this agent
const { result } = await buildAndSign('get_last_index', REPUTATION_REGISTRY, [
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(clientAddress, { type: 'address' }),
], signerAddress, signFn, rpc, networkPassphrase);
const lastIndex = StellarSdk.scValToNative(result) as number;

// Get the number of responses to a specific feedback entry
// Returns u32
const { result: countResult } = await buildAndSign('get_response_count', REPUTATION_REGISTRY, [
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(clientAddress, { type: 'address' }),
  StellarSdk.nativeToScVal(BigInt(1), { type: 'u64' }),  // feedbackIndex
], signerAddress, signFn, rpc, networkPassphrase);
const responseCount = StellarSdk.scValToNative(countResult) as number;
```

### Reading Feedback via Explorer API (Off-Chain)

For bulk reads, the explorer API is more efficient than on-chain calls:

```typescript
import { ExplorerClient } from '@trionlabs/8004-sdk';

const explorer = new ExplorerClient();
const feedback = await explorer.getFeedback(agentId, { tag: 'starred', limit: 50 });
// Returns full feedback entries including event-only fields (endpoint, feedbackUri, feedbackHash)
```

### Feedback Tags

| Tag | Measures | Example |
|-----|----------|---------|
| `starred` | Quality rating (0-100) | 87/100 |
| `uptime` | Endpoint uptime % | 99.77% |
| `successRate` | Task success rate % | 89% |
| `responseTime` | Response time (ms) | 560ms |
| `reachable` | Endpoint reachable | 1/0 |

Tags are free-form strings (max 64 chars). The above are conventions, not enforced by the contract.

## Step 5: Validation

### Why Validation Matters

Reputation measures past performance. Validation attests to agent properties — identity verification, code audits, hardware guarantees.

| Model | Mechanism | Best For |
|-------|-----------|----------|
| **Reputation-based** | Client feedback via Step 4 | Low-stake, frequent interactions |
| **Crypto-economic** | Stake + slashing | Medium-stake financial operations |
| **zkML** | Zero-knowledge proofs | Privacy-preserving verification |
| **TEE Attestation** | Hardware isolation proofs | High-assurance environments |

### validation_request

Submit a validation request for your agent to a specific validator.

```typescript
// Generate unique request hash
const data = new TextEncoder().encode(
  `${agentId}:${validatorAddr}:${Date.now()}:${crypto.randomUUID()}`
);
const requestHash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));

await buildAndSign('validation_request', VALIDATION_REGISTRY, [
  StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),    // caller
  StellarSdk.nativeToScVal(validatorAddr, { type: 'address' }),    // validator
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),              // agentId
  StellarSdk.nativeToScVal('https://request.example.com', { type: 'string' }), // requestUri
  StellarSdk.nativeToScVal(requestHash, { type: 'bytes' }),        // requestHash
], signerAddress, signFn, rpc, networkPassphrase);
```

Or with the SDK:

```typescript
import { generateRequestNonce } from '@trionlabs/8004-sdk';
const requestHash = generateRequestNonce(agentId, validatorAddr);
```

### validation_response

Validator responds to a pending request.

```typescript
const responseContent = JSON.stringify({ result: 'passed', details: 'code audit complete' });
const responseHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(responseContent));

await buildAndSign('validation_response', VALIDATION_REGISTRY, [
  StellarSdk.nativeToScVal(validatorAddr, { type: 'address' }),    // caller (validator)
  StellarSdk.nativeToScVal(requestHash, { type: 'bytes' }),        // requestHash
  StellarSdk.nativeToScVal(1, { type: 'u32' }),                    // response (1 = approved)
  StellarSdk.nativeToScVal('https://response.example.com', { type: 'string' }), // responseUri
  StellarSdk.nativeToScVal(new Uint8Array(responseHashBuf), { type: 'bytes' }), // responseHash
  StellarSdk.nativeToScVal('kyc', { type: 'string' }),             // tag
], validatorAddr, validatorSignFn, rpc, networkPassphrase);
```

### get_validation_status

```typescript
const { result } = await buildAndSign('get_validation_status', VALIDATION_REGISTRY, [
  StellarSdk.nativeToScVal(requestHash, { type: 'bytes' }),
], signerAddress, signFn, rpc, networkPassphrase);
const status = StellarSdk.scValToNative(result);
// Returns ValidationStatus:
// {
//   validator_address: Address,
//   agent_id: u32,
//   response: u32,            — 0 = pending, 1 = approved, other = custom
//   response_hash: BytesN<32>,
//   tag: string,
//   last_update: u64,         — ledger sequence
//   has_response: bool,
// }
```

> **Storage note:** `response_uri` is event-only — use the indexer or parse `ValidationResponse` events to retrieve it.

### get_summary (Validation)

```typescript
const { result } = await buildAndSign('get_summary', VALIDATION_REGISTRY, [
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(validatorAddresses, { type: { vec: 'address' } }),
  StellarSdk.nativeToScVal('kyc', { type: 'string' }),  // tag filter ('' = all)
], signerAddress, signFn, rpc, networkPassphrase);
// Returns ValidationSummary with counts and response breakdown
```

### Paginated Queries

```typescript
// All validation request hashes for an agent
const { result } = await buildAndSign('get_agent_validations_paginated', VALIDATION_REGISTRY, [
  StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
  StellarSdk.nativeToScVal(0, { type: 'u32' }),    // start
  StellarSdk.nativeToScVal(20, { type: 'u32' }),   // limit
], signerAddress, signFn, rpc, networkPassphrase);

// All request hashes assigned to a validator
const { result: valResult } = await buildAndSign('get_validator_requests_paginated', VALIDATION_REGISTRY, [
  StellarSdk.nativeToScVal(validatorAddr, { type: 'address' }),
  StellarSdk.nativeToScVal(0, { type: 'u32' }),
  StellarSdk.nativeToScVal(20, { type: 'u32' }),
], signerAddress, signFn, rpc, networkPassphrase);

// Check if a request exists
// request_exists(requestHash) → bool
```

## Trust Verification Workflow

Full end-to-end: verify identity → check reputation → interact → pay via x402 → give feedback.

```typescript
import * as StellarSdk from '@stellar/stellar-sdk';
import { ExplorerClient } from '@trionlabs/8004-sdk';

async function verifyAndInteract(targetAgentId: number, minScore = 70) {
  const explorer = new ExplorerClient();

  // 1. Verify agent exists and get metadata
  const agent = await explorer.getAgent(targetAgentId);
  if (!agent) throw new Error('Agent not found');

  // 2. Check reputation threshold
  if (agent.feedbackCount > 0 && agent.avgScore < minScore) {
    throw new Error(`Agent score ${agent.avgScore} below threshold ${minScore}`);
  }

  // 3. Find the service endpoint
  const x402Service = agent.services?.find(s => s.name === 'x402');
  if (!x402Service) throw new Error('Agent has no x402 endpoint');

  // 4. Interact via x402 payment (see /x402s skill)
  const response = await fetchPaid(x402Service.endpoint);
  const result = await response.json();

  // 5. Give feedback based on outcome
  const feedbackValue = result.success ? BigInt(90) : BigInt(30);
  const tag = result.success ? 'starred' : 'failed';

  const hashBuf = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(result)));

  await buildAndSign('give_feedback', REPUTATION_REGISTRY, [
    StellarSdk.nativeToScVal(signerAddress, { type: 'address' }),
    StellarSdk.nativeToScVal(targetAgentId, { type: 'u32' }),
    StellarSdk.nativeToScVal(feedbackValue, { type: 'i128' }),
    StellarSdk.nativeToScVal(0, { type: 'u32' }),
    StellarSdk.nativeToScVal(tag, { type: 'string' }),
    StellarSdk.nativeToScVal('', { type: 'string' }),
    StellarSdk.nativeToScVal(x402Service.endpoint, { type: 'string' }),
    StellarSdk.nativeToScVal('', { type: 'string' }),
    StellarSdk.nativeToScVal(new Uint8Array(hashBuf), { type: 'bytes' }),
  ], signerAddress, signFn, rpc, networkPassphrase);

  return result;
}
```

## x402 Integration

Combine agent trust (`/8004s`) with payments (`/x402s`):

```typescript
async function payTrustedAgent(agentId: number, serviceUrl: string) {
  const explorer = new ExplorerClient();

  // 1. Check reputation before paying
  const agent = await explorer.getAgent(agentId);
  if ((agent.avgScore ?? 0) < 80) {
    throw new Error('Agent not trusted enough for payment');
  }

  // 2. Pay via x402 (see /x402s skill for full setup)
  const response = await fetchPaid(serviceUrl);

  // 3. Give feedback after service delivery
  // (see give_feedback example above)
}
```

Pattern: **verify trust → pay → give feedback**. This creates a virtuous cycle — good agents earn reputation, bad agents lose it.

## Storage vs Events

Understanding what's stored on-chain vs emitted as events is critical for reading data correctly.

### What's Stored On-Chain (readable via contract calls)

| Registry | Stored Fields |
|----------|--------------|
| **Identity** | Agent URI, wallet, metadata key-value pairs, NFT owner/balance |
| **Reputation** | `FeedbackData { value, value_decimals, is_revoked, tag1, tag2 }`, client list, last_index, response_count |
| **Validation** | `ValidationStatus { validator_address, agent_id, response, response_hash, tag, last_update, has_response }`, agent/validator index lists |

### What's Event-Only (need indexer or event parsing)

| Registry | Event-Only Fields |
|----------|------------------|
| **Reputation** | `endpoint`, `feedback_uri`, `feedback_hash` (in `NewFeedback` event) |
| **Validation** | `response_uri` (in `ValidationResponse` event) |
| **Identity** | All changes emit events, but data is also stored |

### Why This Matters

- `read_feedback()` returns `{ value, value_decimals, is_revoked, tag1, tag2 }` — **not** endpoint or feedbackUri
- To get endpoint/URI fields, use the Explorer API (`explorer.getFeedback()`) or parse events via `rpc.getEvents()`
- `get_validation_status()` returns everything except `response_uri` — parse `ValidationResponse` events for that

## Error Handling

### Transaction Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `tx_bad_seq` | Nonce mismatch — concurrent transactions | Retry with fresh account sequence |
| `TRY_AGAIN_LATER` | Network congestion | Wait a few seconds and retry |
| `Simulation failed` | Invalid args, insufficient auth, or contract error | Check error message for contract error code |
| `Transaction confirmation timed out` | Network delays | Check tx hash on explorer, may have succeeded |

### Contract Error Codes

**Identity Registry** (11 codes): not found, not authorized, URI too long, key too long, value too long, too many metadata keys, reserved key, empty value, upgrade pending, upgrade not ready, no pending upgrade

**Reputation Registry** (12 codes): agent not found, self-feedback blocked, feedback not found, already revoked, not feedback author, not agent owner/authorized, index out of range, invalid tag length, invalid value decimals, upgrade pending, upgrade not ready, no pending upgrade

**Validation Registry** (11 codes): agent not found, request already exists, request not found, not validator, already responded, invalid response, invalid tag, upgrade pending, upgrade not ready, no pending upgrade, not authorized

Use `formatSorobanError(err)` from the SDK to convert error codes to readable messages.

## Technical Reference

### All Public Methods

#### Identity Registry

| Method | Parameters | Returns |
|--------|-----------|---------|
| `register(caller)` | `Address` | `u32` (agentId) |
| `register_with_uri(caller, agent_uri)` | `Address, String` | `u32` |
| `register_full(caller, agent_uri, metadata)` | `Address, String, Vec<MetadataEntry>` | `u32` |
| `set_agent_uri(caller, agent_id, new_uri)` | `Address, u32, String` | `Result<()>` |
| `agent_uri(agent_id)` | `u32` | `Result<String>` |
| `set_metadata(caller, agent_id, key, value)` | `Address, u32, String, Bytes` | `Result<()>` |
| `get_metadata(agent_id, key)` | `u32, String` | `Option<Bytes>` |
| `set_agent_wallet(caller, agent_id, new_wallet)` | `Address, u32, Address` | `Result<()>` |
| `get_agent_wallet(agent_id)` | `u32` | `Option<Address>` |
| `unset_agent_wallet(caller, agent_id)` | `Address, u32` | `Result<()>` |
| `find_owner(agent_id)` | `u32` | `Option<Address>` |
| `agent_exists(agent_id)` | `u32` | `bool` |
| `is_authorized_or_owner(spender, agent_id)` | `Address, u32` | `bool` |
| `total_agents()` | — | `u32` |
| `extend_ttl(agent_id)` | `u32` | — |
| `version()` | — | `String` |

Ownership (OZ 2-step): `get_owner()`, `transfer_ownership(new_owner)`, `accept_ownership()`, `renounce_ownership()`

Upgrades (3-day timelock): `propose_upgrade(new_wasm_hash)`, `execute_upgrade()`, `cancel_upgrade()`, `pending_upgrade()`

#### Reputation Registry

| Method | Parameters | Returns |
|--------|-----------|---------|
| `give_feedback(caller, agent_id, value, value_decimals, tag1, tag2, endpoint, feedback_uri, feedback_hash)` | `Address, u32, i128, u32, String, String, String, String, BytesN<32>` | `Result<()>` |
| `revoke_feedback(caller, agent_id, feedback_index)` | `Address, u32, u64` | `Result<()>` |
| `append_response(caller, agent_id, client_address, feedback_index, response_uri, response_hash)` | `Address, u32, Address, u64, String, BytesN<32>` | `Result<()>` |
| `read_feedback(agent_id, client_address, feedback_index)` | `u32, Address, u64` | `Result<FeedbackData>` |
| `get_summary(agent_id, client_addresses, tag1, tag2)` | `u32, Vec<Address>, String, String` | `Result<SummaryResult>` |
| `get_clients_paginated(agent_id, start, limit)` | `u32, u32, u32` | `Vec<Address>` |
| `get_last_index(agent_id, client_address)` | `u32, Address` | `u64` |
| `get_response_count(agent_id, client_address, feedback_index)` | `u32, Address, u64` | `u32` |
| `get_identity_registry()` | — | `Address` |
| `extend_ttl()` | — | — |
| `version()` | — | `String` |

#### Validation Registry

| Method | Parameters | Returns |
|--------|-----------|---------|
| `validation_request(caller, validator_address, agent_id, request_uri, request_hash)` | `Address, Address, u32, String, BytesN<32>` | `Result<()>` |
| `validation_response(caller, request_hash, response, response_uri, response_hash, tag)` | `Address, BytesN<32>, u32, String, BytesN<32>, String` | `Result<()>` |
| `get_validation_status(request_hash)` | `BytesN<32>` | `Result<ValidationStatus>` |
| `request_exists(request_hash)` | `BytesN<32>` | `bool` |
| `get_summary(agent_id, validator_addresses, tag)` | `u32, Vec<Address>, String` | `ValidationSummary` |
| `get_agent_validations_paginated(agent_id, start, limit)` | `u32, u32, u32` | `Vec<BytesN<32>>` |
| `get_validator_requests_paginated(validator_address, start, limit)` | `Address, u32, u32` | `Vec<BytesN<32>>` |
| `get_identity_registry()` | — | `Address` |
| `extend_ttl()` | — | — |
| `version()` | — | `String` |

### Contract Events

#### Identity Events

| Event | Topics | Data |
|-------|--------|------|
| `Registered` | `[agentId: u32, owner: Address]` | `agentUri: String` |
| `UriUpdated` | `[agentId: u32, updatedBy: Address]` | `newUri: String` |
| `MetadataSet` | `[agentId: u32, key: String]` | `value: Bytes` |

> Wallet changes emit `MetadataSet` with `key="agentWallet"` — no separate WalletSet/WalletRemoved events.

#### Reputation Events

| Event | Topics | Data |
|-------|--------|------|
| `NewFeedback` | `[agentId: u32, client: Address, tag1: String]` | `feedbackIndex: u64, value: i128, valueDecimals: u32, tag2: String, endpoint: String, feedbackUri: String, feedbackHash: BytesN<32>` |
| `FeedbackRevoked` | `[agentId: u32, client: Address, feedbackIndex: u64]` | — |
| `ResponseAppended` | `[agentId: u32, client: Address, responder: Address]` | `feedbackIndex: u64, responseUri: String, responseHash: BytesN<32>` |

#### Validation Events

| Event | Topics | Data |
|-------|--------|------|
| `ValidationRequest` | `[validator: Address, agentId: u32, requestHash: BytesN<32>]` | `requestUri: String` |
| `ValidationResponse` | `[validator: Address, agentId: u32, requestHash: BytesN<32>]` | `response: u32, responseUri: String, responseHash: BytesN<32>, tag: String` |

#### Querying Events

```typescript
const rpc = new StellarSdk.rpc.Server('https://soroban-testnet.stellar.org');
const events = await rpc.getEvents({
  startLedger: lastProcessedLedger,
  filters: [{ type: 'contract', contractIds: [IDENTITY_REGISTRY] }],
  limit: 100,
});
for (const event of events.events) {
  const eventName = StellarSdk.scValToNative(event.topic[0]);
  const firstTopic = StellarSdk.scValToNative(event.topic[1]);
  // topic[0] = event name, topic[1..n] = indexed fields, event.value = data body
}
```

## Additional Resources

- [EIP-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004) | [8004.org](https://www.8004.org)
- [Stellar 8004 Contracts](https://github.com/trionlabs/stellar-8004) | [8004scan Explorer](https://stellar8004.com)

## Related Skills

- [stellar-dev](https://github.com/stellar/stellar-dev-skill) — General Stellar/Soroban development (required companion)
- [x402s](../x402s/SKILL.md) — x402 payment protocol on Stellar
