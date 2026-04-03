#!/usr/bin/env bash
set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
INDEXER_SECRET="${INDEXER_SECRET:-}"

echo "Triggering indexer at ${SUPABASE_URL}..."

response="$(
  curl -sS -X POST \
    "${SUPABASE_URL}/functions/v1/indexer" \
    -H "Authorization: Bearer ${INDEXER_SECRET}" \
    -H "Content-Type: application/json"
)"

if command -v jq >/dev/null 2>&1; then
  printf '%s\n' "$response" | jq .
else
  printf '%s\n' "$response"
fi
