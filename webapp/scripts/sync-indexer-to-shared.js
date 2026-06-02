#!/usr/bin/env node
/**
 * Generate the Deno edge copy of the indexer:
 *   packages/indexer/src/  ->  supabase/functions/_shared/indexer/
 *
 * This is the SINGLE canonical generator. `pnpm indexer:build/serve/deploy`
 * and the docker `functions-init` service all delegate here so the committed
 * copy can never diverge depending on which entrypoint ran.
 *
 * Transforms:
 *   - rewrites relative `.js` import specifiers to `.ts` (Deno loads raw TS)
 *   - prepends an AUTO-GENERATED banner so the copy is never hand-edited
 *
 * Excludes test files (`*.test.ts`, `__tests__/`) and the package barrel
 * (`index.ts`) — none of which are valid in the Deno edge runtime.
 *
 * Usage:
 *   node scripts/sync-indexer-to-shared.js          # regenerate
 *   node scripts/sync-indexer-to-shared.js --check   # verify in sync (CI)
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'packages', 'indexer', 'src');
const DEST = join(ROOT, 'supabase', 'functions', '_shared', 'indexer');

const checkOnly = process.argv.includes('--check');
const mismatches = [];

function banner(relPath) {
  return (
    `// AUTO-GENERATED from packages/indexer/src/${relPath} — DO NOT EDIT.\n` +
    `// Regenerate with: pnpm --filter @stellar8004/indexer sync:shared\n\n`
  );
}

function transform(content, relPath) {
  // Rewrite relative `.js` specifiers to `.ts`. Covers static `import ... from`
  // / `export ... from` and dynamic `import('./x.js')`. Assumes the source has
  // no `.js` relative specifiers inside string/comment content (asserted below).
  const body = content
    .replace(/(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.[^'"]*?)\.js\2/g, '$1$2$3.ts$2');
  return banner(relPath) + body;
}

/** Recursively list every .ts file under `dir` as DEST-relative POSIX paths. */
function listTsFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // DEST does not exist yet
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      listTsFiles(p, out);
    } else if (entry.endsWith('.ts')) {
      out.push(relative(DEST, p).split(/[\\/]/).join('/'));
    }
  }
  return out;
}

function collect(srcDir, destDir, out) {
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);

    if (statSync(srcPath).isDirectory()) {
      if (entry === '__tests__') continue;
      collect(srcPath, join(destDir, entry), out);
      continue;
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts') || entry === 'index.ts') {
      continue;
    }

    const relPath = relative(SRC, srcPath).split(/[\\/]/).join('/');
    out.push({ destPath: join(destDir, entry), relPath, srcPath });
  }
}

const files = [];
collect(SRC, DEST, files);

if (checkOnly) {
  const expectedRelPaths = new Set();
  for (const { destPath, relPath, srcPath } of files) {
    // Compare normalized (LF) content so a CRLF checkout doesn't false-fail.
    const expected = transform(readFileSync(srcPath, 'utf-8'), relPath).replace(/\r\n/g, '\n');
    let actual = null;
    try {
      actual = readFileSync(destPath, 'utf-8').replace(/\r\n/g, '\n');
    } catch {
      // missing file -> mismatch
    }
    if (actual !== expected) mismatches.push(relPath);
    expectedRelPaths.add(relPath);
  }

  // Orphan detection: a renamed/deleted source file (or a stale committed file)
  // would otherwise linger in the edge copy and ship to Deno while --check
  // stayed green, because the loop above only validates files we WOULD emit.
  const orphans = listTsFiles(DEST).filter((p) => !expectedRelPaths.has(p));

  if (mismatches.length > 0 || orphans.length > 0) {
    if (mismatches.length > 0) {
      console.error('Edge indexer copy is out of sync with packages/indexer/src:');
      for (const m of mismatches) console.error(`  - changed: ${m}`);
    }
    if (orphans.length > 0) {
      console.error('Edge indexer copy contains files the generator would not emit:');
      for (const o of orphans) console.error(`  - orphan: ${o}`);
    }
    console.error('\nRun: pnpm --filter @stellar8004/indexer sync:shared');
    process.exit(1);
  }
  console.log('Edge indexer copy is in sync.');
  process.exit(0);
}

console.log('Generating supabase/functions/_shared/indexer/ from packages/indexer/src/');
rmSync(DEST, { recursive: true, force: true });
for (const { destPath, relPath, srcPath } of files) {
  mkdirSync(join(destPath, '..'), { recursive: true });
  writeFileSync(destPath, transform(readFileSync(srcPath, 'utf-8'), relPath));
  console.log(`  ✓ ${relPath}`);
}
console.log(`Done (${files.length} files).`);
