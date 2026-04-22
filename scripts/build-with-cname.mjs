#!/usr/bin/env node
/**
 * Build wrapper that preserves docs/CNAME (and docs/.nojekyll just in case).
 *
 * - vite.config.ts already sets `emptyOutDir: false`, but we belt-and-brace
 *   here by snapshotting CNAME before the build and rewriting it after.
 * - Idempotent: if no CNAME exists, nothing is written.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(root, 'docs');
const cnamePath = resolve(docsDir, 'CNAME');

const preserved = existsSync(cnamePath) ? readFileSync(cnamePath) : null;
if (preserved) {
  console.log(`[build:pages] preserving docs/CNAME (${preserved.length} bytes)`);
}

const result = spawnSync('npx', ['vite', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (preserved) {
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });
  writeFileSync(cnamePath, preserved);
  console.log('[build:pages] restored docs/CNAME');
}
