---
name: x402s
description: x402 HTTP-native payment protocol for AI agents on Stellar. Use when implementing pay-per-use APIs, agent micropayments, or HTTP 402 Payment Required flows with USDC on Stellar/Soroban.
license: Apache-2.0
metadata:
  author: trionlabs
  version: "1.0.0"
  x402-sdk-version: "~2.9.0"
---

# x402: HTTP-Native Agent Payments on Stellar

x402 is an open protocol from Coinbase that activates the HTTP 402 "Payment Required" status code for programmatic per-request payments. On Stellar, it uses Soroban authorization entries and USDC for near-instant micropayments — ideal for AI agent commerce.

> **Companion skills:** `/stellar-dev` for Soroban transaction patterns and Freighter integration. `/8004s` for agent identity and reputation.
>
> **EVM version:** See `/x402` for the Celo equivalent using thirdweb.

## When to Use

- Implementing pay-per-use API endpoints on Stellar
- Building AI agents that pay for services autonomously
- Creating micropayment flows for content or data access
- Accepting USDC payments without traditional payment infrastructure

## Key Benefits

| Feature | Traditional Payments | x402 on Stellar |
|---------|---------------------|-----------------|
| Setup Time | Days to weeks | Minutes |
| Settlement | 2-7 days | ~5 seconds |
| Fees | 2-3% + $0.30 | ~$0.00001 |
| Minimum Payment | $0.50+ | $0.001 |
| AI Agent Support | Not possible | Native |
| Client needs XLM? | — | No (fee-bump) |

## Installation

```bash
npm install @x402/core @x402/express @x402/fetch @x402/stellar @stellar/stellar-sdk
```

Written against `@x402/stellar@~2.9.0`. Compatible with `@stellar/stellar-sdk@^15.0.1` and `@stellar/freighter-api@^6.0.0`. The x402 ecosystem is evolving fast — check for breaking changes if using a newer version.

## Server Side (Express)

Protect endpoints with `paymentMiddlewareFromConfig`. The server scheme parses prices and enhances payment requirements — it takes no constructor arguments.

```typescript
import express from "express";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";

const app = express();

app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /my-service": {
        accepts: {
          scheme: "exact",
          price: "$0.01",
          network: "stellar:testnet",
          payTo: "GABC123...YOUR_STELLAR_ADDRESS",
        },
      },
    },
    new HTTPFacilitatorClient({ url: "https://www.x402.org/facilitator" }),
    [{ network: "stellar:testnet", server: new ExactStellarScheme() }],
  ),
);

app.get("/my-service", (_, res) => res.json({ data: "premium content" }));
app.listen(3001);
```

**Key points:**
- Route format is `"METHOD /path"` (e.g., `"GET /my-service"`)
- `paymentMiddlewareFromConfig` takes 3 args: route config, facilitator client, scheme array
- `ExactStellarScheme` from `/exact/server` takes no parameters
- Price is in USD string format (`"$0.01"`)
- `payTo` is the Stellar address (G...) receiving USDC payments

### Using OpenZeppelin Facilitator (mainnet support)

The Coinbase facilitator (`x402.org/facilitator`) only supports testnet. For mainnet, use OpenZeppelin:

```typescript
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://channels.openzeppelin.com/x402/testnet",  // or /x402 for mainnet
  createAuthHeaders: async () => {
    const headers = { Authorization: `Bearer ${process.env.X402_API_KEY}` };
    return { verify: headers, settle: headers, supported: headers };
  },
});
```

Generate API keys at:
- Testnet: `https://channels.openzeppelin.com/testnet/gen`
- Mainnet: `https://channels.openzeppelin.com/gen`

## Client Side (Agent — Private Key)

For server-to-server or autonomous agent payments. The flow is: fetch → detect 402 → create payment payload → retry with payment headers.

```typescript
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const NETWORK = "stellar:testnet";
const RPC_URL = "https://soroban-testnet.stellar.org";

// Create signer from S-format secret key
const signer = createEd25519Signer(process.env.STELLAR_PRIVATE_KEY!, NETWORK);
const rpcConfig = { url: RPC_URL };

// Register Stellar scheme with client
const client = new x402Client().register(
  "stellar:*",
  new ExactStellarScheme(signer, rpcConfig),
);
const httpClient = new x402HTTPClient(client);

async function fetchPaid(url: string) {
  // 1. First request — get 402
  const firstTry = await fetch(url);
  if (firstTry.status !== 402) return firstTry;

  // 2. Extract payment requirement from headers
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => firstTry.headers.get(name),
  );

  // 3. Create signed payment payload
  const paymentPayload = await client.createPaymentPayload(paymentRequired);

  // 4. Encode headers and retry
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  return fetch(url, { headers: paymentHeaders });
}

const response = await fetchPaid("https://api.example.com/my-service");
const data = await response.json();
```

**Key points:**
- `createEd25519Signer(privateKey, network)` — private key is S-format (starts with `S`)
- `ExactStellarScheme` from `/exact/client` takes signer + optional rpcConfig
- The client flow is **manual** — no auto-retry wrapper for Stellar currently
- Register with `"stellar:*"` wildcard to handle all Stellar networks
- **Network validation:** ensure the client's network (e.g. `stellar:testnet`) matches the server's `payTo` network — mismatches cause silent settlement failures

## Client Side (Browser — Wallet Signing)

x402 browser clients need a `ClientStellarSigner` — an object with `address` and `signAuthEntry`. The `signTransaction` method is **optional** for clients (only `signAuthEntry` is required).

```typescript
// ClientStellarSigner interface (from @x402/stellar)
type ClientStellarSigner = {
  address: string;
  signAuthEntry: SignAuthEntry;       // Required — signs Soroban auth entries
  signTransaction?: SignTransaction;  // Optional for clients
};
```

### Using Stellar Wallets Kit (recommended)

The official `stellar/x402-stellar` examples use [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit) (SWK) which wraps all 6 compatible wallets:

```typescript
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import type { SignAuthEntry } from "@stellar/stellar-sdk/contract";
import type { ClientStellarSigner } from "@x402/stellar";
import { getNetworkPassphrase } from "@x402/stellar";

function createWalletSigner(
  address: string,
  network: string,
  kit: StellarWalletsKit,
): ClientStellarSigner {
  const signAuthEntry: SignAuthEntry = async (authEntry, opts?) => {
    const result = await kit.signAuthEntry(authEntry, {
      address,
      networkPassphrase: opts?.networkPassphrase || getNetworkPassphrase(network),
    });
    return {
      signedAuthEntry: result.signedAuthEntry,
      signerAddress: result.signerAddress || address,
    };
  };
  return { address, signAuthEntry };
}
```

Then use with x402 client:

```typescript
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const walletSigner = createWalletSigner(publicKey, "stellar:testnet", kit);
const client = new x402Client().register(
  "stellar:*",
  new ExactStellarScheme(walletSigner, { url: "https://soroban-testnet.stellar.org" }),
);
const httpClient = new x402HTTPClient(client);

// Same manual flow as agent client: fetch → 402 → createPaymentPayload → retry
```

### Using Freighter directly

If not using SWK, wrap Freighter's `signAuthEntry` directly. **Freighter 6.x uses a default export** for CJS compatibility:

```typescript
import freighterApi from "@stellar/freighter-api";
const { signAuthEntry, getAddress } = freighterApi;
import type { ClientStellarSigner } from "@x402/stellar";

const address = (await getAddress()).address;
const signer: ClientStellarSigner = {
  address,
  signAuthEntry: async (authEntry, opts?) => {
    const result = await signAuthEntry(authEntry, { address });
    return {
      signedAuthEntry: result.signedAuthEntry ?? "",
      signerAddress: result.signerAddress || address,
    };
  },
};
```

> **Note:** Freighter returns `signedAuthEntry: string | null` while x402 expects `string`. Handle the null case.
> **Import pattern:** Do NOT use `import { signAuthEntry } from "@stellar/freighter-api"` — use the default import and destructure. Named imports break CJS bundling.

### Compatible wallets

Freighter (browser extension), Albedo, Hana, HOT, Klever, OneKey.

> **Freighter Mobile** does NOT support x402 (lacks auth-entry signing).

### Full example

See [stellar/x402-stellar/examples/simple-paywall](https://github.com/stellar/x402-stellar/tree/main/examples/simple-paywall) — Express server + React/Vite client with SWK wallet connection.

> **Note:** No Svelte x402 component exists yet. The browser flow is the same regardless of framework — create a `ClientStellarSigner`, wire it to `ExactStellarScheme`, handle the 402 → sign → retry flow.

## Payment Flow

```
1. Client: GET /resource
2. Server: 402 + PAYMENT-REQUIRED header (price, network, payTo, scheme)
3. Client: Signs Soroban auth entry via wallet or private key
4. Client: GET /resource + PAYMENT-SIGNATURE header
5. Facilitator: Verifies signature, wraps in fee-bump tx, submits to Stellar
6. Server: 200 + PAYMENT-RESPONSE header (tx hash, settlement status) + resource
```

### HTTP Headers

| Header | Direction | Content |
|--------|-----------|---------|
| `PAYMENT-REQUIRED` | Server → Client | Base64 JSON: scheme, price, network, payTo, asset |
| `PAYMENT-SIGNATURE` | Client → Server | Base64 JSON: signed auth entry, transaction XDR |
| `PAYMENT-RESPONSE` | Server → Client | Base64 JSON: settlement result, tx hash |

All payment data lives in headers — response body is reserved for the actual resource.

## Facilitators

| Provider | URL | Networks | API Key |
|----------|-----|----------|---------|
| Coinbase | `https://www.x402.org/facilitator` | testnet only | Not required |
| OpenZeppelin | `https://channels.openzeppelin.com/x402/testnet` | testnet | Required (Bearer) |
| OpenZeppelin | `https://channels.openzeppelin.com/x402` | mainnet | Required (Bearer) |

Facilitator endpoints: `/verify`, `/settle`, `/supported`

**Self-hosted:** Deploy OpenZeppelin Relayer with [x402 Facilitator Plugin](https://github.com/OpenZeppelin/relayer-plugin-x402-facilitator).

## USDC on Stellar

| Network | Contract Address | Decimals |
|---------|-----------------|----------|
| Testnet | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | 7 |
| Mainnet | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` | 7 |

**Important:** Stellar USDC uses **7 decimals** (not 6 like EVM). 1 USDC = 10,000,000 base units.

Default asset is USDC, but any SEP-41 compliant token is supported.

## Network Configuration

| Network | CAIP-2 ID | RPC URL | Passphrase |
|---------|-----------|---------|------------|
| Testnet | `stellar:testnet` | `https://soroban-testnet.stellar.org` | `Test SDF Network ; September 2015` |
| Mainnet | `stellar:pubnet` | Provider-dependent | `Public Global Stellar Network ; September 2015` |

## Fee Sponsorship

Clients do **not** need XLM to pay for transactions. The facilitator:

1. Receives the client's signed auth entry
2. Wraps it in a fee-bump transaction
3. Pays the network fee from its own account
4. Submits to Stellar

This removes the cold-start problem for AI agents — they only need USDC, not XLM.

## Soroban Auth Details

x402 on Stellar uses Soroban authorization entries to authorize SEP-41 `transfer()` calls:

- **Nonce:** Random `int64` for replay protection (each nonce valid for one signature lifetime)
- **Signature expiry:** Ledger sequence number (~12 ledgers / ~60 seconds from creation)
- **Auth entry:** `HashIdPreimageSorobanAuthorization` signed by client wallet
- **Contract call:** `transfer(from: Address, to: Address, amount: i128)` on USDC contract

The facilitator verifies the auth entry, simulates the transaction, and settles on-chain.

## Error Handling

### Client errors

```typescript
async function fetchPaid(url: string) {
  const firstTry = await fetch(url);
  if (firstTry.status !== 402) return firstTry;

  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => firstTry.headers.get(name),
  );

  let paymentPayload;
  try {
    paymentPayload = await client.createPaymentPayload(paymentRequired);
  } catch (err) {
    // Common causes: insufficient USDC balance, RPC unreachable, wallet rejected signing
    throw new Error(`Payment creation failed: ${err instanceof Error ? err.message : err}`);
  }

  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paidResponse = await fetch(url, { headers: paymentHeaders });

  if (paidResponse.status === 402) {
    // Payment was rejected by facilitator — signature invalid, expired, or amount mismatch
    const retryRequired = httpClient.getPaymentRequiredResponse(
      (name) => paidResponse.headers.get(name),
    );
    throw new Error(`Payment rejected: ${JSON.stringify(retryRequired)}`);
  }

  return paidResponse;
}
```

### Common error causes

| Error | Cause | Fix |
|-------|-------|-----|
| Insufficient balance | USDC balance too low | Fund via Circle faucet (testnet) |
| Simulation failed | Auth entry invalid or expired | Check RPC URL, retry with fresh payload |
| Wallet rejected | User declined signing prompt | Handle gracefully in UI |
| Network mismatch | Client on testnet, server on mainnet | Verify `NETWORK` matches on both sides |
| Facilitator unreachable | Bad URL or API key | Check facilitator URL and Bearer token |

## Testing & Local Development

### Setup testnet account

```bash
# 1. Create keypair (or use Stellar Lab: https://lab.stellar.org/account/create)
# 2. Fund with XLM via Friendbot
curl "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"

# 3. Get testnet USDC from Circle Faucet
#    Go to https://faucet.circle.com → select "Stellar Testnet" → paste public key
#    Gives 20 USDC per address every 2 hours
```

**Important:** You must have a USDC trustline before receiving USDC. Stellar Lab's fund page has a trustline button, or set it up programmatically. Without a trustline, USDC transfers will fail silently.

### Test with curl

```bash
# Trigger 402 response
curl -v http://localhost:3001/my-service
# → HTTP 402 + PAYMENT-REQUIRED header (base64 encoded)

# Decode payment requirement
curl -s http://localhost:3001/my-service -o /dev/null -D - | grep -i payment-required
```

The `PAYMENT-SIGNATURE` header requires Soroban auth entry signing — use the client.js script for end-to-end testing rather than curl.

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't receive USDC | Trustline not set — create trustline for USDC issuer first |
| 402 not returned | Check middleware route format (`"GET /path"`) and `payTo` address |
| Facilitator verify fails | Ensure `network` matches (`stellar:testnet`), check API key for OZ |
| Client timeout | Verify RPC URL: `https://soroban-testnet.stellar.org` |
| Freighter signing fails | Ensure Freighter is on Testnet (Settings → Network) |
| `@stellar/stellar-sdk` version conflict | `@x402/stellar@2.9.0` works with `@stellar/stellar-sdk@^14.6.1` and `^15.0.1` |
| Freighter import error | Use default import: `import freighterApi from "@stellar/freighter-api"`, not named imports |

## Integration with ERC-8004

Combine agent trust (`/8004s`) with payments (`/x402s`):

```typescript
// 1. Check agent reputation before paying
const summary = await getAgentSummary(agentId);
if (summary.averageScore < 70) throw new Error("Low reputation");

// 2. Pay for service via x402
const response = await fetchPaid(agentServiceUrl);

// 3. Give feedback after service delivery
await giveFeedback(agentId, 90, "starred", agentServiceUrl);
```

## Environment Variables

```bash
# Client
STELLAR_PRIVATE_KEY=S...           # Ed25519 secret key (S-format)

# Server (OpenZeppelin facilitator)
X402_API_KEY=your_api_key          # From channels.openzeppelin.com

# Optional
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
```

## Additional Resources

- [x402 on Stellar — Stellar Docs](https://developers.stellar.org/docs/build/agentic-payments/x402)
- [Quickstart Guide](https://developers.stellar.org/docs/build/agentic-payments/x402/quickstart-guide)
- [Built on Stellar Facilitator](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar)
- [x402 Protocol Spec](https://www.x402.org)
- [coinbase/x402 GitHub](https://github.com/coinbase/x402) — Monorepo (Stellar at `typescript/packages/mechanisms/stellar/`)
- [stellar/x402-stellar](https://github.com/stellar/x402-stellar) — Stellar Foundation examples (paywall, self-hosted facilitator)
- [OpenZeppelin Facilitator Plugin](https://github.com/OpenZeppelin/relayer-plugin-x402-facilitator)
- [Signing Soroban Invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations)

## Related Skills

- [stellar-dev](https://github.com/stellar/stellar-dev-skill) — General Stellar/Soroban development (required companion)
- [8004s](../8004s/SKILL.md) — ERC-8004 Agent Trust Protocol on Stellar
- [x402](../x402/SKILL.md) — x402 on Celo (EVM version)
