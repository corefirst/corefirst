#!/usr/bin/env node
/**
 * Fix pnpm standalone node_modules for Electron packaging.
 *
 * Problems solved:
 * 1. Stub packages (only package.json, no actual files) — fill from .pnpm/ store.
 * 2. Missing transitive deps of serverExternalPackages — copy from project node_modules.
 * 3. Absolute-path symlinks that break codesign — replace with real files.
 * 4. Out-of-bundle relative symlinks in .pnpm/ — dereference all symlinks.
 */

const fs   = require('fs');
const path = require('path');

const standaloneNm = path.join('.next', 'standalone', 'node_modules');
const pnpmStore    = path.join(standaloneNm, '.pnpm');
const projectNm    = 'node_modules';
let   fixed = 0;

// ── A. Fix stubs ──────────────────────────────────────────────────────────────
function fillFromPnpm(pkgName, pkgDir) {
  try {
    const entries  = fs.readdirSync(pkgDir);
    const realFiles = entries.filter(e => !e.startsWith('.') && e !== 'package.json');
    if (realFiles.length > 0) return;

    const pkgJson  = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const version  = pkgJson.version;
    if (!version) return;

    const encoded  = pkgName.replace('/', '+');
    const storeDir = path.join(pnpmStore, `${encoded}@${version}`, 'node_modules', pkgName);
    if (!fs.existsSync(storeDir)) return;

    for (const entry of fs.readdirSync(storeDir)) {
      if (entry === 'package.json') continue;
      const src = path.join(storeDir, entry);
      const dst = path.join(pkgDir, entry);
      if (!fs.existsSync(dst)) {
        fs.cpSync(src, dst, { recursive: true, dereference: true });
      }
    }
    fixed++;
  } catch { /* skip */ }
}

function walkTopLevel(base) {
  if (!fs.existsSync(base)) return;
  for (const entry of fs.readdirSync(base)) {
    if (entry.startsWith('.')) continue;
    const dir = path.join(base, entry);
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
    if (entry.startsWith('@')) {
      for (const sub of fs.readdirSync(dir)) {
        fillFromPnpm(`${entry}/${sub}`, path.join(dir, sub));
      }
    } else {
      fillFromPnpm(entry, dir);
    }
  }
}

walkTopLevel(standaloneNm);

// ── B. Copy missing transitive deps from project node_modules ─────────────────
const visited = new Set();

function copyFromProject(pkgName) {
  const dst = path.join(standaloneNm, pkgName);
  if (fs.existsSync(dst)) {
    const entries = fs.readdirSync(dst).filter(e => !e.startsWith('.') && e !== 'package.json');
    if (entries.length > 0) return;
  }
  const src = path.join(projectNm, pkgName);
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  // dereference: true → follow symlinks and copy actual files
  fs.cpSync(fs.realpathSync(src), dst, { recursive: true, dereference: true });
  fixed++;
}

function copyPackageTree(pkgName) {
  if (visited.has(pkgName)) return;
  visited.add(pkgName);
  copyFromProject(pkgName);
  try {
    const pkgJsonPath = path.join(projectNm, pkgName, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return;
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const deps = Object.keys({ ...pkgJson.dependencies, ...pkgJson.peerDependencies });
    for (const dep of deps) {
      if (fs.existsSync(path.join(projectNm, dep))) copyPackageTree(dep);
    }
  } catch { /* skip */ }
}

for (const pkg of ['pouchdb','pouchdb-node','pouchdb-adapter-leveldb','leveldown','classic-level']) {
  if (fs.existsSync(path.join(projectNm, pkg))) copyPackageTree(pkg);
}

// ── C. Dereference all remaining symlinks in standalone/node_modules ──────────
function dereferenceSymlinks(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      try {
        const realPath = fs.realpathSync(fullPath);
        fs.rmSync(fullPath, { recursive: true, force: true });
        fs.cpSync(realPath, fullPath, { recursive: true, dereference: true });
        fixed++;
      } catch {
        // If realpath fails (broken symlink), just remove it
        try { fs.rmSync(fullPath, { force: true }); } catch { /* skip */ }
      }
    } else if (entry.isDirectory()) {
      dereferenceSymlinks(fullPath);
    }
  }
}

dereferenceSymlinks(standaloneNm);

console.log(`done: ${fixed} packages fixed/added/dereferenced`);
