import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RoleplayPackSchema, type RoleplayPack } from '@/src/types/roleplay-pack';
import { listPacks, readPack, writePack, deletePack, validatePackJSON } from '@/src/lib/roleplay-pack/loader';
import { renderForRoleplay } from '@/src/lib/roleplay-pack/injector';

const makeMinimalPack = (id: string): RoleplayPack => ({
  schemaVersion: '2.0',
  id,
  name: `Test Pack ${id}`,
  domain: 'Testing',
  sourceLang: 'Chinese',
  prompt: 'You are a test coach. Keep it simple.',
  defaultInputMode: 'free',
});

describe('RoleplayPackSchema', () => {
  it('parses a valid v2.0 pack', () => {
    const result = RoleplayPackSchema.safeParse(makeMinimalPack('valid-pack'));
    expect(result.success).toBe(true);
  });

  it('rejects packs with invalid id format', () => {
    const result = RoleplayPackSchema.safeParse({ ...makeMinimalPack('bad'), id: 'Has Spaces' });
    expect(result.success).toBe(false);
  });

  it('rejects packs missing prompt', () => {
    const { prompt: _, ...noprompt } = makeMinimalPack('no-prompt');
    const result = RoleplayPackSchema.safeParse(noprompt);
    expect(result.success).toBe(false);
  });

  it('rejects packs missing sourceLang', () => {
    const { sourceLang: _, ...noLang } = makeMinimalPack('no-lang');
    const result = RoleplayPackSchema.safeParse(noLang);
    expect(result.success).toBe(false);
  });

  it('defaults defaultInputMode to free when omitted', () => {
    const { defaultInputMode: _, ...noMode } = makeMinimalPack('no-mode');
    const result = RoleplayPackSchema.safeParse(noMode);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.defaultInputMode).toBe('free');
  });
});

describe('validatePackJSON', () => {
  it('returns structured errors for invalid input', () => {
    const result = validatePackJSON({ schemaVersion: '2.0', id: 'BAD ID' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it('accepts a valid pack', () => {
    const result = validatePackJSON(makeMinimalPack('ok-pack'));
    expect(result.ok).toBe(true);
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

  it('writes and reads a user pack', async () => {
    const pack = makeMinimalPack('test-pack');
    await writePack(userId, pack);
    const entry = await readPack(userId, 'test-pack');
    expect(entry).not.toBeNull();
    expect(entry?.source).toBe('user');
    expect(entry?.pack.id).toBe('test-pack');
    expect(entry?.pack.prompt).toBe(pack.prompt);
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
  it('returns the pack prompt as packSection', () => {
    const pack = makeMinimalPack('render-test');
    const result = renderForRoleplay(pack);
    expect(result.packSection).toBe(pack.prompt);
  });

  it('derives context from pack name and domain', () => {
    const pack = makeMinimalPack('ctx-test');
    const result = renderForRoleplay(pack);
    expect(result.derivedContext).toContain(pack.name);
    expect(result.derivedContext).toContain(pack.domain);
  });
});
