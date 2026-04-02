#!/bin/bash
set -euo pipefail

# Trustless Agents on Stellar - Hackathon Demo
# Requires: stellar CLI (cargo install stellar-cli)

IDENTITY=CAYPUQB3XGXJ76N4H32TUQE2FHJ65BZN62Q2JVMC6U5NWJBUYHNDGALT
REPUTATION=CACIFRSDXQ5BQDWN6UNKH65IFA2ALRMLVQWRK33EXZYVYOS32TLUP5UG
VALIDATION=CDOTQZMJZEWIEWMFQS3HIQBM4WIJANHSYQKMOWMJP6UL6EIZXXVNSD6Y
NETWORK=testnet

step() {
  echo ""
  echo "================================================"
  echo "  $1"
  echo "================================================"
  echo ""
  sleep 1
}

invoke() {
  stellar contract invoke --id "$1" --source-account "$2" --network $NETWORK -- "${@:3}" 2>/dev/null
}

invoke_show() {
  stellar contract invoke --id "$1" --source-account "$2" --network $NETWORK -- "${@:3}" 2>&1
}

# Setup accounts
step "SETUP: Creating two testnet accounts"

stellar keys generate agent-owner --network testnet --fund 2>/dev/null || true
stellar keys generate reviewer --network testnet --fund 2>/dev/null || true
OWNER=$(stellar keys address agent-owner)
REVIEWER=$(stellar keys address reviewer)
echo "Agent Owner:  $OWNER"
echo "Reviewer:     $REVIEWER"

# 1. Register agent
step "1. REGISTER AN AI AGENT ON-CHAIN"

echo "Calling: identity_registry.register_with_uri()"
AGENT_ID=$(invoke $IDENTITY agent-owner register_with_uri \
  --caller "$OWNER" \
  --agent_uri '"https://myagent.example.com/.well-known/agent-registration.json"')
echo ""
echo "Agent registered as NFT with ID: $AGENT_ID"
echo "Global identifier: stellar:testnet:$IDENTITY#$AGENT_ID"

# 2. Set metadata
step "2. SET AGENT METADATA"

echo "Setting service endpoint metadata..."
invoke $IDENTITY agent-owner set_metadata \
  --caller "$OWNER" \
  --agent_id "$AGENT_ID" \
  --key '"service"' \
  --value '4d4350' > /dev/null
echo "Metadata set: service = MCP"

echo ""
echo "Reading back..."
URI=$(invoke $IDENTITY agent-owner agent_uri --agent_id "$AGENT_ID")
echo "Agent URI: $URI"

# 3. Give feedback
step "3. REVIEWER GIVES FEEDBACK"

echo "Reviewer rates the agent's reliability: 92/100"
invoke_show $REPUTATION reviewer give_feedback \
  --caller "$REVIEWER" \
  --agent_id "$AGENT_ID" \
  --value 92 \
  --value_decimals 0 \
  --tag1 '"reliability"' \
  --tag2 '"latency"' \
  --endpoint '"https://myagent.example.com/mcp"' \
  --feedback_uri '""' \
  --feedback_hash 0000000000000000000000000000000000000000000000000000000000000000 \
  2>&1 | grep "Event:" || true
echo ""
echo "Feedback recorded on-chain"

# 4. Query reputation
step "4. QUERY AGENT REPUTATION"

echo "Anyone can read the feedback:"
FB=$(invoke $IDENTITY agent-owner read_feedback \
  --agent_id "$AGENT_ID" --client_address "$REVIEWER" --feedback_index 1 2>/dev/null || \
  invoke $REPUTATION reviewer read_feedback \
  --agent_id "$AGENT_ID" --client_address "$REVIEWER" --feedback_index 1)
echo "$FB" | python3 -m json.tool 2>/dev/null || echo "$FB"

echo ""
echo "Aggregate summary (O(1) query via running aggregates):"
SUMMARY=$(invoke $REPUTATION reviewer get_summary \
  --agent_id "$AGENT_ID" \
  --client_addresses '[]' \
  --tag1 '""' \
  --tag2 '""')
echo "$SUMMARY" | python3 -m json.tool 2>/dev/null || echo "$SUMMARY"

# 5. Request validation
step "5. REQUEST THIRD-PARTY VALIDATION"

HASH=$(printf '%064d' 1)
echo "Agent owner requests validation from the reviewer (acting as validator)..."
invoke_show $VALIDATION agent-owner validation_request \
  --caller "$OWNER" \
  --validator_address "$REVIEWER" \
  --agent_id "$AGENT_ID" \
  --request_uri '"https://validate.example.com/task/123"' \
  --request_hash "$HASH" \
  2>&1 | grep "Event:" || true

echo ""
echo "Validator responds with score 95/100..."
invoke_show $VALIDATION reviewer validation_response \
  --caller "$REVIEWER" \
  --request_hash "$HASH" \
  --response 95 \
  --response_uri '"https://proof.example.com/result/123"' \
  --response_hash $(printf '%064d' 2) \
  --tag '"capability"' \
  2>&1 | grep "Event:" || true

echo ""
echo "Validation status:"
STATUS=$(invoke $VALIDATION reviewer get_validation_status --request_hash "$HASH")
echo "$STATUS" | python3 -m json.tool 2>/dev/null || echo "$STATUS"

# Done
step "DEMO COMPLETE"

echo "Contracts:"
echo "  Identity:   $IDENTITY"
echo "  Reputation: $REPUTATION"
echo "  Validation: $VALIDATION"
echo "  Agent ID:   stellar:testnet:$IDENTITY#$AGENT_ID"
echo ""
echo "View on Stellar Expert:"
echo "  https://stellar.expert/explorer/testnet/contract/$IDENTITY"
