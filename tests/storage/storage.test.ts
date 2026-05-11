import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;
const USER = 'tester';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corefirst-storage-'));
  process.env.COREFIRST_DATA_DIR = tmpDir;
});

afterEach(async () => {
  // Close every PouchDB instance touched during the test so the tmp dir can
  // be removed without "EBUSY" on Linux runners.
  const { closeAllProviders } = await import('@/src/lib/storage/pouch-provider');
  await closeAllProviders();
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

// Reload the storage module so each test starts with a clean module registry
// — important because providers are kept in a process-wide Map.
async function freshStorage() {
  const { vi } = await import('vitest');
  vi.resetModules();
  return import('@/src/lib/storage');
}

const baseManifest = (slug: string, packageId: string) => ({
  packageId,
  slug,
  topic: 'Networking',
  ageGroup: 'adult',
  industry: 'IT',
  sourceLang: 'Chinese',
  targetLang: 'English',
  createdAt: '2026-05-08T10:00:00.000Z',
  version: '1' as const,
  lessons: [
    {
      lessonIndex: 0,
      title: 'Greetings',
      scenario_desc: 'Conference small talk',
      vocabulary_focus: [{ token: 'leverage', meaning: 'to make use of' }],
      visual_generation_prompts: ['A bright conference hall'],
      scripts: [
        {
          scriptIndex: 0,
          speaker: 'User',
          cfltL1: '[Core: hi]',
          cfltL2: '[Core: hi]',
          standardL2: 'Hi.',
          standardL1: '你好。',
          ssml: '<speak>Hi.</speak>',
        },
      ],
    },
  ],
});

describe('package round-trip (BlobStore)', () => {
  it('writes and reads a .corefirst package', async () => {
    const storage = await freshStorage();
    const audio = new Map([['audio/l0s0.mp3', Uint8Array.from([1, 2, 3, 4])]]);
    const images = new Map([['images/l0.webp', Uint8Array.from([9, 9])]]);

    const written = await storage.writePackage(USER, {
      manifest: baseManifest('it-english-adult-networking', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      audio,
      images,
      saveFull: true,
    });
    expect(written.slug).toBe('it-english-adult-networking');

    const manifest = await storage.readPackageManifest(USER, 'it-english-adult-networking');
    expect(manifest.lessons[0].scripts[0].standardL2).toBe('Hi.');

    const readAudio = await storage.readPackageAudio(USER, 'it-english-adult-networking', 0, 0);
    expect(Array.from(readAudio)).toEqual([1, 2, 3, 4]);

    const readImage = await storage.readPackageImage(USER, 'it-english-adult-networking', 0);
    expect(readImage && Array.from(readImage)).toEqual([9, 9]);

    const list = await storage.listPackages(USER);
    expect(list.map((p) => p.slug)).toContain('it-english-adult-networking');
  });
});

describe('slug uniqueness', () => {
  it('appends -2 suffix when a different package owns the base slug', async () => {
    const storage = await freshStorage();
    const m1 = baseManifest('it-english-adult-meeting', 'aaaaaaaa-1111-4ccc-8ddd-eeeeeeeeeeee');
    const m2 = baseManifest('it-english-adult-meeting', 'bbbbbbbb-2222-4ccc-8ddd-eeeeeeeeeeee');

    await storage.writePackage(USER, { manifest: m1, audio: new Map(), images: new Map() });

    const resolved = await storage.resolveUniqueSlug(USER, m2.slug, m2.packageId);
    expect(resolved).toBe('it-english-adult-meeting-2');
  });

  it('reuses the same slug when re-saving the same packageId', async () => {
    const storage = await freshStorage();
    const m1 = baseManifest('it-english-adult-meeting', 'aaaaaaaa-1111-4ccc-8ddd-eeeeeeeeeeee');
    await storage.writePackage(USER, { manifest: m1, audio: new Map(), images: new Map() });

    const resolved = await storage.resolveUniqueSlug(USER, m1.slug, m1.packageId);
    expect(resolved).toBe('it-english-adult-meeting');
  });
});

describe('multi-user isolation', () => {
  it('keeps two users\' packages, transforms, and SRS completely separate', async () => {
    const storage = await freshStorage();
    const alice = 'alice';
    const bob = 'bob';

    await storage.writePackage(alice, {
      manifest: baseManifest('it-english-adult-alice', 'aaaaaaaa-aaaa-4ccc-8ddd-eeeeeeeeeeee'),
      audio: new Map(),
      images: new Map(),
    });
    await storage.writePackage(bob, {
      manifest: baseManifest('it-english-adult-bob', 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      audio: new Map(),
      images: new Map(),
    });

    const aliceList = await storage.listPackages(alice);
    const bobList = await storage.listPackages(bob);
    expect(aliceList.map((p) => p.slug)).toEqual(['it-english-adult-alice']);
    expect(bobList.map((p) => p.slug)).toEqual(['it-english-adult-bob']);

    await storage.appendTransform(alice, null, {
      inputText: 'hello alice',
      sourceLang: 'Chinese',
      targetLang: 'English',
      cfltL1: '',
      cfltL2: '',
      standardL2: 'hi.',
    });
    const aliceGlobal = await storage.readGlobalRecord(alice);
    const bobGlobal = await storage.readGlobalRecord(bob);
    expect(aliceGlobal!.transforms).toHaveLength(1);
    expect(bobGlobal?.transforms ?? []).toHaveLength(0);
  });
});

describe('record append flows (PouchDB)', () => {
  const PACKAGE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const SLUG = 'it-english-adult-networking';

  beforeEach(async () => {
    const storage = await freshStorage();
    await storage.writePackage(USER, {
      manifest: baseManifest(SLUG, PACKAGE_ID),
      audio: new Map([['audio/l0s0.mp3', Uint8Array.from([0])]]),
      images: new Map(),
    });
  });

  it('appends attempts and serializes Phase-2 fields as null', async () => {
    const storage = await freshStorage();
    await storage.appendAttempt(USER, SLUG, PACKAGE_ID, 0, 0, {
      transcription: 'Hi.',
      overallScore: 85,
      pronunciation: 90,
      logicStress: 80,
      feedback: 'Nice stress.',
    });

    const record = await storage.readRecord(USER, SLUG);
    expect(record).not.toBeNull();
    const attempt = record!.lessons[0].scripts[0].attempts[0];
    expect(attempt.overallScore).toBe(85);
    expect(attempt.scoreCoreAction).toBeNull();
  });

  it('handles concurrent appends without losing entries (per-event docs)', async () => {
    const storage = await freshStorage();
    const count = 10;
    const writes = Array.from({ length: count }, (_, i) =>
      storage.appendAttempt(USER, SLUG, PACKAGE_ID, 0, 0, {
        transcription: `attempt ${i}`,
        overallScore: i * 10,
        pronunciation: 50,
        logicStress: 50,
        feedback: 'ok',
      }),
    );
    await Promise.all(writes);

    const record = await storage.readRecord(USER, SLUG);
    // Per-event docs ensure each concurrent attempt becomes its own doc — none
    // lost to RMW races even under burst load.
    expect(record!.lessons[0].scripts[0].attempts).toHaveLength(count);
  });

  it('preserves all concurrent transforms (per-event docs prevent lost writes)', async () => {
    const storage = await freshStorage();
    const count = 10;
    const writes = Array.from({ length: count }, (_, i) =>
      storage.appendTransform(USER, null, {
        inputText: `input ${i}`,
        sourceLang: 'Chinese',
        targetLang: 'English',
        cfltL1: '',
        cfltL2: '',
        standardL2: `out ${i}`,
      }),
    );
    await Promise.all(writes);

    const global = await storage.readGlobalRecord(USER);
    expect(global!.transforms).toHaveLength(count);
  });

  it('appends a transform to the global record', async () => {
    const storage = await freshStorage();
    await storage.appendTransform(USER, null, {
      inputText: '我去会议',
      sourceLang: 'Chinese',
      targetLang: 'English',
      cfltL1: '[Core: 我去] [Space: 会议]',
      cfltL2: '[Core: I go] [Space: meeting]',
      standardL2: 'I am going to the meeting.',
    });
    const record = await storage.readGlobalRecord(USER);
    expect(record!.transforms).toHaveLength(1);
  });

  it('upserts a roleplay session by sessionId', async () => {
    const storage = await freshStorage();
    const sessionId = '11111111-2222-4333-8444-555555555555';
    const input = {
      sessionId,
      context: 'demo',
      sourceLang: 'Chinese',
      targetLang: 'English',
    };

    await storage.upsertRoleplaySession(USER, null, {
      ...input,
      newMessages: [
        { role: 'user', content: 'hi', createdAt: '2026-05-08T10:00:00.000Z' },
      ],
    });

    await storage.upsertRoleplaySession(USER, null, {
      ...input,
      newMessages: [
        { role: 'assistant', content: 'hello', createdAt: '2026-05-08T10:00:01.000Z' },
      ],
    });

    const record = await storage.readGlobalRecord(USER);
    expect(record!.roleplaySessions).toHaveLength(1);
    expect(record!.roleplaySessions[0].messages).toHaveLength(2);
  });
});

describe('vocabulary capture', () => {
  it('dedups by (targetLang, token) and records firstSeenIn', async () => {
    const storage = await freshStorage();
    await storage.captureVocabulary(
      USER,
      'English',
      [{ token: 'leverage', meaning: 'make use of' }],
      { slug: 'it-english-adult-x', lessonIndex: 0, scriptIndex: 0 },
    );
    // Same token in same targetLang → dedup
    await storage.captureVocabulary(
      USER,
      'English',
      [{ token: 'leverage', meaning: 'make use of (duplicate)' }],
    );
    // Same surface form but different target language → distinct entry
    await storage.captureVocabulary(
      USER,
      'German',
      [{ token: 'leverage', meaning: 'Hebel' }],
    );

    const { vocabulary } = await storage.readAllProgress(USER);
    expect(vocabulary).toHaveLength(2);
    const en = vocabulary.find((v: any) => v.targetLang === 'English');
    const de = vocabulary.find((v: any) => v.targetLang === 'German');
    expect(en?.firstSeenIn?.slug).toBe('it-english-adult-x');
    expect(de?.meaning).toBe('Hebel');
  });
});
