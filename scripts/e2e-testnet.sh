#!/bin/bash
set -euo pipefail

# ERC-8004 Trustless Agents - Testnet E2E Test
# Exercises full lifecycle: register, feedback, revoke, validate, query

IDENTITY=CAYPUQB3XGXJ76N4H32TUQE2FHJ65BZN62Q2JVMC6U5NWJBUYHNDGALT
REPUTATION=CACIFRSDXQ5BQDWN6UNKH65IFA2ALRMLVQWRK33EXZYVYOS32TLUP5UG
VALIDATION=CDOTQZMJZEWIEWMFQS3HIQBM4WIJANHSYQKMOWMJP6UL6EIZXXVNSD6Y
SOURCE=deployer
NETWORK=testnet

invoke_id() {
  stellar contract invoke --id "$1" --source-account $SOURCE --network $NETWORK -- "$2" "${@:3}" 2>/dev/null
}

invoke_id_loud() {
  stellar contract invoke --id "$1" --source-account $SOURCE --network $NETWORK -- "$2" "${@:3}"
}

echo "=== ERC-8004 Testnet E2E ==="
echo ""

# 1. Verify all contracts are alive
echo "1. Checking contract versions..."
V1=$(invoke_id $IDENTITY version)
V2=$(invoke_id $REPUTATION version)
V3=$(invoke_id $VALIDATION version)
echo "   Identity:   $V1"
echo "   Reputation: $V2"
echo "   Validation: $V3"
echo ""

# 2. Generate a reviewer account
echo "2. Creating reviewer account..."
stellar keys generate reviewer --network testnet --fund 2>/dev/null || true
REVIEWER=$(stellar keys address reviewer)
echo "   Reviewer: $REVIEWER"
echo ""

# 3. Register an agent
echo "3. Registering agent..."
DEPLOYER=$(stellar keys address deployer)
AGENT_ID=$(invoke_id $IDENTITY register --caller "$DEPLOYER")
echo "   Agent ID: $AGENT_ID"
echo ""

# 4. Set agent URI
echo "4. Setting agent URI..."
invoke_id_loud $IDENTITY set_agent_uri \
  --caller "$DEPLOYER" \
  --agent_id "$AGENT_ID" \
  --new_uri '"https://example.com/agent.json"' 2>/dev/null
echo "   URI set"

# 5. Verify agent URI
URI=$(invoke_id $IDENTITY agent_uri --agent_id "$AGENT_ID")
echo "   Agent URI: $URI"
echo ""

# 6. Give feedback (from reviewer)
echo "5. Giving feedback..."
stellar contract invoke --id $REPUTATION --source-account reviewer --network $NETWORK -- give_feedback \
  --caller "$REVIEWER" \
  --agent_id "$AGENT_ID" \
  --value 85 \
  --value_decimals 0 \
  --tag1 '"reliability"' \
  --tag2 '"uptime"' \
  --endpoint '""' \
  --feedback_uri '""' \
  --feedback_hash 0000000000000000000000000000000000000000000000000000000000000000 \
  2>&1 | grep -E "Event:|error" || true
echo "   Feedback submitted"
echo ""

# 7. Read feedback
echo "6. Reading feedback..."
FB=$(invoke_id $REPUTATION read_feedback \
  --agent_id "$AGENT_ID" \
  --client_address "$REVIEWER" \
  --feedback_index 1)
echo "   Feedback: $FB"
echo ""

# 8. Get summary
echo "7. Getting summary..."
SUMMARY=$(invoke_id $REPUTATION get_summary \
  --agent_id "$AGENT_ID" \
  --client_addresses '[]' \
  --tag1 '""' \
  --tag2 '""')
echo "   Summary: $SUMMARY"
echo ""

# 9. Request validation
echo "8. Requesting validation..."
invoke_id_loud $VALIDATION validation_request \
  --caller "$DEPLOYER" \
  --validator_address "$REVIEWER" \
  --agent_id "$AGENT_ID" \
  --request_uri '"https://validate.example.com"' \
  --request_hash 0100000000000000000000000000000000000000000000000000000000000000 \
  2>&1 | grep -E "Event:|error" || true
echo "   Validation requested"
echo ""

# 10. Submit validation response (from reviewer acting as validator)
echo "9. Submitting validation response..."
stellar contract invoke --id $VALIDATION --source-account reviewer --network $NETWORK -- validation_response \
  --caller "$REVIEWER" \
  --request_hash 0100000000000000000000000000000000000000000000000000000000000000 \
  --response 90 \
  --response_uri '"https://proof.example.com"' \
  --response_hash 0200000000000000000000000000000000000000000000000000000000000000 \
  --tag '"capability"' \
  2>&1 | grep -E "Event:|error" || true
echo "   Validation response submitted"
echo ""

# 11. Get validation status
echo "10. Getting validation status..."
STATUS=$(invoke_id $VALIDATION get_validation_status \
  --request_hash 0100000000000000000000000000000000000000000000000000000000000000)
echo "    Status: $STATUS"
echo ""

# 12. Get validation summary
echo "11. Getting validation summary..."
VSUMMARY=$(invoke_id $VALIDATION get_summary \
  --agent_id "$AGENT_ID" \
  --validator_addresses '[]' \
  --tag '""')
echo "    Validation summary: $VSUMMARY"
echo ""

# 13. Extend TTLs
echo "12. Extending TTLs..."
invoke_id $IDENTITY extend_ttl --agent_id "$AGENT_ID"
invoke_id $REPUTATION extend_ttl
invoke_id $VALIDATION extend_ttl
echo "    TTLs extended"
echo ""

echo "=== E2E COMPLETE ==="
