import * as fs from 'fs';
import * as path from 'path';

const cache = new Map<string, string>();

function resolveSafe(relativePath: string): string {
  const root = process.cwd();
  const resolved = path.resolve(root, relativePath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`loadPrompt: path escapes project root: ${relativePath}`);
  }
  return resolved;
}

function readRaw(relativePath: string, useCache: boolean): string {
  if (useCache) {
    const hit = cache.get(relativePath);
    if (hit !== undefined) return hit;
  }
  const text = fs.readFileSync(resolveSafe(relativePath), 'utf-8');
  if (useCache) cache.set(relativePath, text);
  return text;
}

export interface LoadPromptOptions {
  /**
   * Skip the module-level cache and re-read the file. Used by admin tools that
   * need to pick up edits to a prompt without restarting the process.
   *
   * NOTE: `fresh: true` reads from disk but does NOT invalidate the shared
   * cache — other callers continue to serve their cached copy until the
   * process restarts. This is intentional: the cache exists to avoid per-
   * request disk I/O in hot paths, and we don't want one admin call to force
   * every subsequent request to re-read.
   */
  fresh?: boolean;
}

/**
 * Load a prompt template and substitute `{{KEY}}` placeholders.
 *
 * - `relativePath` MUST be a hardcoded literal under the project root.
 *   Dynamic paths are rejected by the traversal guard.
 * - Replacement uses a function callback so values containing `$&`, `$1`,
 *   etc. are inserted literally and don't trigger regex-style backreferences.
 * - Cached at module level by default to avoid per-request disk I/O.
 */
export function loadPrompt(
  relativePath: string,
  vars: Record<string, string> = {},
  options: LoadPromptOptions = {},
): string {
  let text = readRaw(relativePath, !options.fresh);
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, () => value);
  }
  return text;
}

/** Test-only: clear the in-memory cache. Not part of the public API. */
export function __clearPromptCacheForTests(): void {
  cache.clear();
}
