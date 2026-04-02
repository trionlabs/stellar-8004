#!/usr/bin/env npx tsx
/**
 * Trustless Agents on Stellar - Interactive SDK Demo
 *
 * Runs the full lifecycle using the TypeScript SDK:
 * register agent, give feedback, query reputation, validate
 *
 * Usage: npx tsx scripts/demo-sdk.ts
 */

import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { Client as IdentityClient } from "../sdk/typescript/packages/identity-registry/src/index.js";
import { Client as ReputationClient } from "../sdk/typescript/packages/reputation-registry/src/index.js";
import { Client as ValidationClient } from "../sdk/typescript/packages/validation-registry/src/index.js";
import { readAllFeedback, agentIdentifier, TESTNET } from "../sdk/typescript/src/index.js";

const RPC_URL = "https://soroban-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;

const IDENTITY_ID = "CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ";
const REPUTATION_ID = "CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4";
const VALIDATION_ID = "CA6GIV7QB4B3O5SBZZRL3E3XMFFECGRETSN4JXAYTFKF5HUTD4JY2SJQ";

function step(title: string) {
  console.log("");
  console.log("================================================");
  console.log(`  ${title}`);
  console.log("================================================");
  console.log("");
}

async function fundAccount(publicKey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!res.ok) throw new Error(`Friendbot failed: ${res.status}`);
}

function makeClientOpts(keypair: Keypair, contractId: string) {
  return {
    contractId,
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: keypair.publicKey(),
    signTransaction: async (xdr: string, opts?: { networkPassphrase?: string }) => {
      const passphrase = opts?.networkPassphrase || PASSPHRASE;
      const tx = TransactionBuilder.fromXDR(xdr, passphrase);
      tx.sign(keypair);
      return {
        signedTxXdr: tx.toEnvelope().toXDR("base64"),
        signerAddress: keypair.publicKey(),
      };
    },
  };
}

async function main() {
  console.log("Trustless Agents on Stellar - SDK Demo");
  console.log("======================================");

  // Setup
  step("SETUP: Creating funded testnet accounts");

  const ownerKp = Keypair.random();
  const reviewerKp = Keypair.random();

  console.log(`Agent Owner:  ${ownerKp.publicKey()}`);
  console.log(`Reviewer:     ${reviewerKp.publicKey()}`);
  console.log("");
  console.log("Funding via Friendbot...");

  await Promise.all([
    fundAccount(ownerKp.publicKey()),
    fundAccount(reviewerKp.publicKey()),
  ]);
  console.log("Funded.");

  // Create clients
  const ownerIdentity = new IdentityClient(makeClientOpts(ownerKp, IDENTITY_ID));
  const ownerValidation = new ValidationClient(makeClientOpts(ownerKp, VALIDATION_ID));
  const reviewerReputation = new ReputationClient(makeClientOpts(reviewerKp, REPUTATION_ID));
  const reviewerValidation = new ValidationClient(makeClientOpts(reviewerKp, VALIDATION_ID));

  // 1. Register agent
  step("1. REGISTER AN AI AGENT ON-CHAIN");

  const registerTx = await ownerIdentity.register({ caller: ownerKp.publicKey() });
  console.log("Simulated, signing and sending...");
  const sent = await registerTx.signAndSend();
  const agentId = sent.result;
  console.log(`Agent registered as NFT with ID: ${agentId}`);
  console.log(`Global identifier: ${agentIdentifier(TESTNET, agentId)}`);

  // 2. Set URI
  step("2. SET AGENT URI");

  const uriTx = await ownerIdentity.set_agent_uri({
    caller: ownerKp.publicKey(),
    agent_id: agentId,
    new_uri: "https://myagent.example.com/.well-known/agent-registration.json",
  });
  await uriTx.signAndSend();

  const readUriTx = await ownerIdentity.agent_uri({ agent_id: agentId });
  const uri = readUriTx.result;
  console.log(`Agent URI: ${JSON.stringify(uri)}`);

  // 3. Give feedback
  step("3. REVIEWER GIVES FEEDBACK");

  console.log("Submitting feedback: reliability=92, latency tag...");
  const fbTx = await reviewerReputation.give_feedback({
    caller: reviewerKp.publicKey(),
    agent_id: agentId,
    value: BigInt(92),
    value_decimals: 0,
    tag1: "reliability",
    tag2: "latency",
    endpoint: "https://myagent.example.com/mcp",
    feedback_uri: "",
    feedback_hash: Buffer.alloc(32),
  });
  await fbTx.signAndSend();
  console.log("Feedback recorded on-chain.");

  // 4. Query reputation
  step("4. QUERY AGENT REPUTATION");

  const readFbTx = await reviewerReputation.read_feedback({
    agent_id: agentId,
    client_address: reviewerKp.publicKey(),
    feedback_index: BigInt(1),
  });
  console.log("Feedback:", JSON.stringify(readFbTx.result, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  , 2));

  const summaryTx = await reviewerReputation.get_summary({
    agent_id: agentId,
    client_addresses: [],
    tag1: "",
    tag2: "",
  });
  console.log("");
  console.log("Aggregate summary:", JSON.stringify(summaryTx.result, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  , 2));

  // 5. Event-based readAllFeedback
  step("5. READ ALL FEEDBACK VIA EVENTS (SDK)");

  const allFeedback = await readAllFeedback(TESTNET, agentId);
  console.log(`Found ${allFeedback.length} feedback entries via event indexing`);
  for (const fb of allFeedback) {
    console.log(`  Value: ${fb.value}, Tags: ${fb.tag1}/${fb.tag2}, Ledger: ${fb.ledger}`);
  }

  // 6. Validation
  step("6. REQUEST AND RECEIVE VALIDATION");

  const requestHash = Buffer.alloc(32);
  requestHash[0] = agentId;

  console.log("Agent owner requests validation...");
  const reqTx = await ownerValidation.validation_request({
    caller: ownerKp.publicKey(),
    validator_address: reviewerKp.publicKey(),
    agent_id: agentId,
    request_uri: "https://validate.example.com/task/123",
    request_hash: requestHash,
  });
  await reqTx.signAndSend();

  console.log("Validator responds with score 95/100...");
  const respHash = Buffer.alloc(32);
  respHash[0] = agentId;
  respHash[1] = 1;
  const respTx = await reviewerValidation.validation_response({
    caller: reviewerKp.publicKey(),
    request_hash: requestHash,
    response: 95,
    response_uri: "https://proof.example.com/result/123",
    response_hash: respHash,
    tag: "capability",
  });
  await respTx.signAndSend();

  const statusTx = await reviewerValidation.get_validation_status({
    request_hash: requestHash,
  });
  console.log("");
  console.log("Validation status:", JSON.stringify(statusTx.result, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  , 2));

  // Done
  step("DEMO COMPLETE");

  console.log(`Agent: ${agentIdentifier(TESTNET, agentId)}`);
  console.log(`Explorer: https://stellar.expert/explorer/testnet/contract/${IDENTITY_ID}`);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
