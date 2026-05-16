import * as fs from 'fs';
import * as path from 'path';

const cache = new Map<string, string>();

// Matches {{VAR_NAME}} — Claude Skills / Handlebars-style placeholders.
// Variable names must be UPPER_SNAKE_CASE or lower_snake_case (letters, digits, underscore).
const PLACEHOLDER_RE = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

function resolveSafe(relativePath: string): string {
  // COREFIRST_ROOT lets the CLI binary resolve prompts from the npm package
  // installation directory instead of the user's cwd.
  const root = process.env.COREFIRST_ROOT ?? process.cwd();
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

export interface TemplateValidationResult {
  valid: boolean;
  /** Placeholders declared in the template. */
  declared: string[];
  /** Declared placeholders with no corresponding key in `vars`. */
  missing: string[];
  /** Keys in `vars` that don't appear in the template (likely typos). */
  unused: string[];
  /** Raw malformed fragments found (unclosed `{{`, stray `}}`, etc.). */
  malformed: string[];
}

/**
 * Validate a prompt template string against a set of variable keys.
 *
 * Follows the Claude Skills / Handlebars `{{VARIABLE}}` convention.
 * Call this in admin routes before persisting user-edited templates.
 */
export function validatePromptTemplate(
  template: string,
  vars: Record<string, string> = {},
): TemplateValidationResult {
  // Find malformed fragments before extracting valid placeholders.
  const malformed: string[] = [];
  // Check line-by-line so the regex state doesn't bleed between checks.
  for (const line of template.split('\n')) {
    // Strip valid placeholders first, then look for leftover `{{` / `}}`.
    const stripped = line.replace(PLACEHOLDER_RE, '');
    const badMatches = stripped.match(/\{\{|\}\}/g);
    if (badMatches) malformed.push(...badMatches.map(() => line.trim()));
  }

  const declared = [...new Set([...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]))];
  const providedKeys = new Set(Object.keys(vars));
  const declaredSet = new Set(declared);

  return {
    valid: malformed.length === 0 && declared.every((k) => providedKeys.has(k)),
    declared,
    missing: declared.filter((k) => !providedKeys.has(k)),
    unused: [...providedKeys].filter((k) => !declaredSet.has(k)),
    malformed,
  };
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
