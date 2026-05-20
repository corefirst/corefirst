import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RoleplayPackSchema, type RoleplayPack } from '@/src/types/roleplay-pack';
import { listPacks, readPack, writePack, deletePack, validatePackJSON } from '@/src/lib/roleplay-pack/loader';
import { renderForRoleplay } from '@/src/lib/roleplay-pack/injector';

const BUNDLED_PACK_PATH = join(process.cwd(), 'data/shared/roleplay-packs/it-software-en.json');

describe('RoleplayPackSchema', () => {
  it('parses the bundled it-software-en pack', () => {
    const raw = JSON.parse(readFileSync(BUNDLED_PACK_PATH, 'utf8'));
    const result = RoleplayPackSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('it-software-en');
      expect(result.data.vocabulary.length).toBeGreaterThan(0);
      expect(result.data.scenarios.length).toBeGreaterThan(0);
      expect(result.data.personas.length).toBeGreaterThan(0);
    }
  });

  it('rejects packs with invalid id format', () => {
    const raw = JSON.parse(readFileSync(BUNDLED_PACK_PATH, 'utf8'));
    raw.id = 'Has Spaces';
    const result = RoleplayPackSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects packs with non-semver version', () => {
    const raw = JSON.parse(readFileSync(BUNDLED_PACK_PATH, 'utf8'));
    raw.version = '1.0';
    const result = RoleplayPackSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects packs missing authorLang', () => {
    const raw = JSON.parse(readFileSync(BUNDLED_PACK_PATH, 'utf8'));
    delete raw.authorLang;
    const result = RoleplayPackSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('applies default coverageTargets when missing', () => {
    const raw = JSON.parse(readFileSync(BUNDLED_PACK_PATH, 'utf8'));
    delete raw.coverageTargets;
    const result = RoleplayPackSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverageTargets.suggested_terms_per_session).toBe(6);
      expect(result.data.coverageTargets.suggested_per_turn_max).toBe(2);
    }
  });
});

describe('validatePackJSON', () => {
  it('returns structured errors for invalid input', () => {
    const result = validatePackJSON({ schemaVersion: '1.0', id: 'BAD ID' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('writePack / readPack / deletePack / listPacks', () => {
  let dataDir: string;
  const userId = 'tester';

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'corefirst-test-'));
    process.env.COREFIRST_DATA_DIR = dataDir;
  });

  afterEach(() => {
    delete process.env.COREFIRST_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  const makeMinimalPack = (id: string): RoleplayPack => ({
    schemaVersion: '1.0',
    id,
    name: `Test Pack ${id}`,
    description: 'Minimal test pack',
    version: '1.0.0',
    domain: 'Testing',
    targetLang: 'English',
    authorLang: 'English',
    ageGroups: [],
    license: 'CC-BY-4.0',
    vocabulary: [
      {
        term: 'merge',
        pos: 'verb',
        priority: 'must_appear',
        register: 'neutral',
        gloss: 'Combine branches',
        collocations: [],
        contexts: [],
        examples: [],
        aliases: [],
        tags: [],
      },
    ],
    scenarios: [],
    personas: [],
    avoidTerms: [],
    coverageTargets: { suggested_terms_per_session: 6, suggested_per_turn_max: 2 },
  });

  it('writes and reads a user pack', async () => {
    const pack = makeMinimalPack('test-pack');
    await writePack(userId, pack);
    const entry = await readPack(userId, 'test-pack');
    expect(entry).not.toBeNull();
    expect(entry?.source).toBe('user');
    expect(entry?.pack.id).toBe('test-pack');
    expect(entry?.pack.vocabulary[0].term).toBe('merge');
  });

  it('round-trips through write+read without data loss', async () => {
    const pack = makeMinimalPack('round-trip');
    await writePack(userId, pack);
    const entry = await readPack(userId, 'round-trip');
    expect(entry?.pack).toEqual(pack);
  });

  it('lists user packs with source=user', async () => {
    await writePack(userId, makeMinimalPack('alpha'));
    await writePack(userId, makeMinimalPack('beta'));
    const list = await listPacks(userId);
    const ids = list.filter((e) => e.source === 'user').map((e) => e.pack.id).sort();
    expect(ids).toEqual(['alpha', 'beta']);
  });

  it('deletes a user pack', async () => {
    await writePack(userId, makeMinimalPack('ephemeral'));
    expect(await readPack(userId, 'ephemeral')).not.toBeNull();
    const deleted = await deletePack(userId, 'ephemeral');
    expect(deleted).toBe(true);
    expect(await readPack(userId, 'ephemeral')).toBeNull();
  });

  it('delete returns false for missing pack', async () => {
    const deleted = await deletePack(userId, 'nonexistent');
    expect(deleted).toBe(false);
  });
});

describe('renderForRoleplay injector', () => {
  const bundled = (() => {
    const raw = JSON.parse(readFileSync(BUNDLED_PACK_PATH, 'utf8'));
    return RoleplayPackSchema.parse(raw);
  })();

  it('produces a non-empty fragment with persona and scenario', () => {
    const result = renderForRoleplay(bundled, 'code-review', 'tech-lead');
    expect(result.packSection.length).toBeGreaterThan(50);
    expect(result.packSection).toContain('Tech Lead');
    expect(result.packSection).toContain('Code Review Discussion');
  });

  it('includes must_appear vocabulary terms', () => {
    const result = renderForRoleplay(bundled, 'code-review', 'tech-lead');
    expect(result.packSection).toContain('deploy');
    expect(result.packSection).toContain('refactor');
  });

  it('includes avoid terms', () => {
    const result = renderForRoleplay(bundled);
    expect(result.packSection).toContain('synergy');
  });

  it('returns scenario roleplay_seed when scenario selected', () => {
    const result = renderForRoleplay(bundled, 'code-review', 'tech-lead');
    expect(result.seed).toBeDefined();
    expect(result.seed?.length).toBeGreaterThan(0);
  });

  it('omits scenario block when no scenarioId provided', () => {
    const result = renderForRoleplay(bundled);
    expect(result.packSection).not.toContain('### Scenario:');
    expect(result.seed).toBeUndefined();
  });

  it('derives context from scenario when available', () => {
    const result = renderForRoleplay(bundled, 'incident-response');
    expect(result.derivedContext).toContain('Production Incident');
  });
});
