# x402 Stellar Quickstart Reference

Complete server and client code from the [official Stellar x402 quickstart guide](https://developers.stellar.org/docs/build/agentic-payments/x402/quickstart-guide). Verified against `@x402/stellar@~2.9.0`.

## Server (server.js)

```javascript
import express from "express";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";

const PORT = "3001";
const ROUTE_PATH = "/my-service";
const PRICE = "$0.01";
const NETWORK = "stellar:testnet";
const FACILITATOR_URL = "https://www.x402.org/facilitator";
const PAY_TO = "GABC123...YOUR_STELLAR_ADDRESS";

const app = express();

app.get("/", (_, res) =>
  res.json({ route: ROUTE_PATH, price: PRICE, network: NETWORK }),
);

app.use(
  paymentMiddlewareFromConfig(
    {
      [`GET ${ROUTE_PATH}`]: {
        accepts: {
          scheme: "exact",
          price: PRICE,
          network: NETWORK,
          payTo: PAY_TO,
        },
      },
    },
    new HTTPFacilitatorClient({ url: FACILITATOR_URL }),
    [{ network: NETWORK, server: new ExactStellarScheme() }],
  ),
);

app.get(ROUTE_PATH, (_, res) => res.json({ secret: "valuable content" }));

app.listen(Number(PORT), () => {
  console.log(`x402 server listening on http://localhost:${PORT}${ROUTE_PATH}`);
});
```

## Client (client.js)

```javascript
import dotenv from "dotenv";
import { Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { createEd25519Signer, getNetworkPassphrase } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
  quiet: true,
});

const STELLAR_PRIVATE_KEY = process.env.STELLAR_PRIVATE_KEY;
const RESOURCE_SERVER_URL = "http://localhost:3001";
const ENDPOINT_PATH = "/my-service";
const NETWORK = "stellar:testnet";
const STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";

async function main() {
  const url = new URL(ENDPOINT_PATH, RESOURCE_SERVER_URL).toString();

  // Create signer from S-format secret key
  const signer = createEd25519Signer(STELLAR_PRIVATE_KEY, NETWORK);
  const rpcConfig = STELLAR_RPC_URL ? { url: STELLAR_RPC_URL } : undefined;

  // Register Stellar scheme
  const client = new x402Client().register(
    "stellar:*",
    new ExactStellarScheme(signer, rpcConfig),
  );
  const httpClient = new x402HTTPClient(client);
  console.log(`Target: ${url}\nClient address: ${signer.address}`);

  // Step 1: First request — get 402
  const firstTry = await fetch(url);
  console.log(`Payment requested: ${firstTry.status}`);

  // Step 2: Extract payment requirement from headers
  const paymentRequired = httpClient.getPaymentRequiredResponse((name) =>
    firstTry.headers.get(name),
  );

  // Step 3: Create payment payload (signs auth entry)
  let paymentPayload = await client.createPaymentPayload(paymentRequired);

  // Step 4: Handle fee sponsorship — set fee to minimum since facilitator pays
  const networkPassphrase = getNetworkPassphrase(NETWORK);
  const tx = new Transaction(
    paymentPayload.payload.transaction,
    networkPassphrase,
  );
  const sorobanData = tx.toEnvelope().v1()?.tx()?.ext()?.sorobanData();
  if (sorobanData) {
    paymentPayload = {
      ...paymentPayload,
      payload: {
        ...paymentPayload.payload,
        transaction: TransactionBuilder.cloneFrom(tx, {
          fee: "1",
          sorobanData,
          networkPassphrase,
        })
          .build()
          .toXDR(),
      },
    };
  }

  // Step 5: Encode payment headers and retry
  const paymentHeaders =
    httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paidResponse = await fetch(url, {
    method: "GET",
    headers: paymentHeaders,
  });

  // Step 6: Read settlement response
  const text = await paidResponse.text();
  const paymentResponse = httpClient.getPaymentSettleResponse((name) =>
    paidResponse.headers.get(name),
  );
  console.log("Settlement response:", paymentResponse);
  console.log(`Access Granted! ${paidResponse.status} "${text}"`);
}

main().catch((error) => {
  console.error("Client failed:", error);
  process.exit(1);
});
```

## .env

```bash
STELLAR_PRIVATE_KEY=S...  # Ed25519 secret key (S-format, starts with S)
```

## Key Implementation Notes

### Server Scheme vs Client Scheme

These are **different classes** with the same name, imported from different paths:

| Import Path | Constructor | Purpose |
|-------------|------------|---------|
| `@x402/stellar/exact/server` | `new ExactStellarScheme()` | Parses prices, enhances requirements |
| `@x402/stellar/exact/client` | `new ExactStellarScheme(signer, rpcConfig?)` | Creates payment payloads, signs auth entries |
| `@x402/stellar/exact/facilitator` | Complex config | Verifies + settles (self-hosted only) |

### Fee Sponsorship Pattern

The client sets `fee: "1"` (minimum) in the cloned transaction because the **facilitator wraps it in a fee-bump transaction** and pays the actual network fee. This eliminates the need for clients to hold XLM.

### Transaction Flow

```
Client: createPaymentPayload() → signs Soroban auth entry
Client: Clones TX with fee:"1" → sends as PAYMENT-SIGNATURE header
Server: Forwards to facilitator
Facilitator: Verifies auth → wraps in fee-bump TX → submits to Stellar
Facilitator: Returns settlement result
Server: Returns resource + PAYMENT-RESPONSE header
```

## OpenZeppelin Facilitator Setup

For mainnet or custom deployment:

```javascript
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://channels.openzeppelin.com/x402/testnet",
  createAuthHeaders: async () => {
    const headers = { Authorization: `Bearer ${process.env.X402_API_KEY}` };
    return { verify: headers, settle: headers, supported: headers };
  },
});
```

Generate API keys:
- Testnet: https://channels.openzeppelin.com/testnet/gen
- Mainnet: https://channels.openzeppelin.com/gen
