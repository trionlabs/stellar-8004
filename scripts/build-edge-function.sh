#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SRC="$PROJECT_ROOT/packages/indexer/src"
DEST="$PROJECT_ROOT/supabase/functions/_shared/indexer"

if [ ! -d "$SRC" ]; then
  echo "ERROR: Source not found: $SRC"
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC"/. "$DEST"/

# Deno loads the copied source as raw TypeScript, so relative import specifiers
# need .ts extensions inside _shared/ even though the package source uses .js.
while IFS= read -r file; do
  perl -0pi -e "s/(['\"]\.\.?\/[^'\"]*)\.js(['\"])/\1.ts\2/g" "$file"
done < <(find "$DEST" -name '*.ts' | sort)

echo "Copied indexer source to $DEST"
echo "TypeScript files: $(find "$DEST" -name '*.ts' | wc -l | tr -d ' ')"
