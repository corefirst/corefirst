import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadPrompt,
  __clearPromptCacheForTests,
} from '../../../src/lib/prompts/loader';

const FIXTURE_DIR = 'tests/lib/prompts/__fixtures__';
const FIXTURE_ABS = path.join(process.cwd(), FIXTURE_DIR);

function writeFixture(name: string, content: string): string {
  fs.mkdirSync(FIXTURE_ABS, { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_ABS, name), content, 'utf-8');
  return `${FIXTURE_DIR}/${name}`;
}

describe('loadPrompt', () => {
  beforeEach(() => {
    __clearPromptCacheForTests();
  });

  afterEach(() => {
    fs.rmSync(FIXTURE_ABS, { recursive: true, force: true });
  });

  it('substitutes {{KEY}} placeholders', () => {
    const rel = writeFixture('basic.md', 'Hello {{NAME}} in {{LANG}}.');
    expect(loadPrompt(rel, { NAME: 'Alice', LANG: 'English' })).toBe(
      'Hello Alice in English.',
    );
  });

  it('replaces all occurrences of the same key', () => {
    const rel = writeFixture('repeat.md', '{{X}}-{{X}}-{{X}}');
    expect(loadPrompt(rel, { X: 'a' })).toBe('a-a-a');
  });

  it('leaves unmatched placeholders untouched', () => {
    const rel = writeFixture('partial.md', 'A={{A}} B={{B}}');
    expect(loadPrompt(rel, { A: '1' })).toBe('A=1 B={{B}}');
  });

  it('inserts $-bearing values literally (no regex backreference)', () => {
    // This is the bug guard: `replaceAll(str, str)` would expand $& to the
    // matched substring. The callback form must be used to avoid that.
    const rel = writeFixture('dollar.md', 'Context: {{C}}');
    expect(loadPrompt(rel, { C: "$& and $1 and $'" })).toBe(
      "Context: $& and $1 and $'",
    );
  });

  it('caches the file across calls (does not re-read by default)', () => {
    const rel = writeFixture('cached.md', 'v1: {{X}}');
    expect(loadPrompt(rel, { X: 'a' })).toBe('v1: a');

    // Mutate the file on disk — cached value should still win.
    fs.writeFileSync(path.join(FIXTURE_ABS, 'cached.md'), 'v2: {{X}}', 'utf-8');
    expect(loadPrompt(rel, { X: 'a' })).toBe('v1: a');
  });

  it('re-reads from disk when { fresh: true }', () => {
    const rel = writeFixture('fresh.md', 'v1: {{X}}');
    expect(loadPrompt(rel, { X: 'a' })).toBe('v1: a');

    fs.writeFileSync(path.join(FIXTURE_ABS, 'fresh.md'), 'v2: {{X}}', 'utf-8');
    expect(loadPrompt(rel, { X: 'a' }, { fresh: true })).toBe('v2: a');
  });

  it('fresh:true does not pollute the shared cache for other callers', () => {
    const rel = writeFixture('isolated.md', 'v1: {{X}}');
    expect(loadPrompt(rel, { X: 'a' })).toBe('v1: a');

    fs.writeFileSync(
      path.join(FIXTURE_ABS, 'isolated.md'),
      'v2: {{X}}',
      'utf-8',
    );
    expect(loadPrompt(rel, { X: 'a' }, { fresh: true })).toBe('v2: a');

    // A subsequent non-fresh call still serves the v1 cached copy.
    expect(loadPrompt(rel, { X: 'a' })).toBe('v1: a');
  });

  it('rejects relative paths that escape the project root', () => {
    expect(() => loadPrompt('../etc/passwd')).toThrow(/escapes project root/);
    expect(() => loadPrompt('src/../../outside.md')).toThrow(
      /escapes project root/,
    );
  });

  it('rejects absolute paths outside the project root', () => {
    const outside = path.join(os.tmpdir(), 'evil.md');
    expect(() => loadPrompt(outside)).toThrow(/escapes project root/);
  });

  it('throws when the file does not exist', () => {
    expect(() =>
      loadPrompt(`${FIXTURE_DIR}/does-not-exist.md`),
    ).toThrow();
  });
});
