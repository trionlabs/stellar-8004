import { TESTNET, readAllFeedback, agentIdentifier } from "./index.js";

async function main() {
  console.log("=== SDK E2E Test ===\n");

  // Agent 2 was created during our testnet E2E run and has feedback
  const agentId = 2;
  console.log(`Agent identifier: ${agentIdentifier(TESTNET, agentId)}\n`);

  console.log("Querying feedback events from testnet RPC...");
  const feedback = await readAllFeedback(TESTNET, agentId, {
    startLedger: 1818900,
  });

  console.log(`Found ${feedback.length} feedback entries\n`);

  for (const entry of feedback) {
    console.log(`  Agent ${entry.agentId} | Client: ${entry.clientAddress.slice(0, 10)}...`);
    console.log(`  Value: ${entry.value} (decimals: ${entry.valueDecimals})`);
    console.log(`  Tags: ${entry.tag1}, ${entry.tag2}`);
    console.log(`  Ledger: ${entry.ledger} | TX: ${entry.txHash.slice(0, 16)}...`);
    console.log("");
  }

  if (feedback.length > 0) {
    console.log("PASS: Event parser works against real testnet data");
  } else {
    console.log("WARN: No feedback events found - events may have expired from RPC window");
  }
}

main().catch(console.error);
