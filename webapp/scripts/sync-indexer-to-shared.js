#!/usr/bin/env node
/**
 * Sync packages/indexer/src/ -> supabase/functions/_shared/indexer/
 * 
 * Copies all source files and transforms .js import extensions to .ts
 * for Deno compatibility. Test files are excluded.
 * 
 * Usage: node scripts/sync-indexer-to-shared.js
 */

import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'packages', 'indexer', 'src');
const DEST = join(ROOT, 'supabase', 'functions', '_shared', 'indexer');

function transformImports(content) {
  return content.replace(/from\s+['"](\..*?)\.js['"]/g, "from '$1.ts'");
}

function syncDir(srcDir, destDir) {
  const entries = readdirSync(srcDir);

  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      if (entry === '__tests__') continue;
      mkdirSync(destPath, { recursive: true });
      syncDir(srcPath, destPath);
      continue;
    }

    if (entry.endsWith('.test.ts') || entry === 'index.ts') {
      continue;
    }

    if (!entry.endsWith('.ts')) {
      continue;
    }

    const content = readFileSync(srcPath, 'utf-8');
    const transformed = transformImports(content);
    writeFileSync(destPath, transformed);

    const relPath = relative(join(ROOT, 'packages', 'indexer', 'src'), srcPath);
    console.log(`  v ${relPath}`);
  }
}

console.log('Syncing packages/indexer/src/ -> supabase/functions/_shared/indexer/');
mkdirSync(DEST, { recursive: true });
syncDir(SRC, DEST);
console.log('Done.');
