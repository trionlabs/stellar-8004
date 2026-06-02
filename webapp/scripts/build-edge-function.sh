#!/usr/bin/env bash
set -euo pipefail

# Thin wrapper around the single canonical generator so that every build/deploy
# entrypoint produces an identical edge copy. Previously this script did its own
# `rm -rf` + `cp -R`, which copied vitest test files and the package barrel into
# the Deno runtime and could drift from the Node `sync:shared` output.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

node "$SCRIPT_DIR/sync-indexer-to-shared.js"
