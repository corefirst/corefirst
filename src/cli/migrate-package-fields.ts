/**
 * One-time migration: rename 'industry' → 'domain' in all on-disk package manifests.
 *
 * Run with:
 *   npx tsx src/cli/migrate-package-fields.ts
 *
 * Do NOT run with plain `node` — this file is TypeScript and requires tsx.
 *
 * Safe to run multiple times (idempotent). Prints a summary of files changed.
 */
import * as fs from 'fs';
import * as path from 'path';

const DATA_ROOT = path.join(process.cwd(), 'data', 'users');

function findPackageFiles(root: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(root)) return results;
  for (const user of fs.readdirSync(root)) {
    const pkgDir = path.join(root, user, 'packages');
    if (!fs.existsSync(pkgDir)) continue;
    for (const file of fs.readdirSync(pkgDir)) {
      if (file.endsWith('.json')) results.push(path.join(pkgDir, file));
    }
  }
  return results;
}

let migrated = 0;
let skipped = 0;

for (const file of findPackageFiles(DATA_ROOT)) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if ('domain' in raw) {
    skipped++;
    continue;
  }
  if ('industry' in raw) {
    const { industry, ...rest } = raw;
    fs.writeFileSync(file, JSON.stringify({ ...rest, domain: industry }, null, 2));
    console.log(`migrated: ${path.relative(process.cwd(), file)}`);
    migrated++;
  }
}

console.log(`\ndone — ${migrated} migrated, ${skipped} already up to date`);
