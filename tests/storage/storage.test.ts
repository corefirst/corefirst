import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corefirst-storage-'));
  process.env.COREFIRST_DATA_DIR = tmpDir;
});

afterEach(async () => {
  // 必须在清理目录前关闭 PouchDB，否则文件会被占用
  const { db } = await import('@/src/lib/storage/record');
  await db.closeAll();
  
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// 辅助函数：重新加载存储模块以响应环境变量变化
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

    const written = await storage.writePackage({
      manifest: baseManifest('it-english-adult', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      audio,
      images,
      saveFull: true,
    });
    expect(written.slug).toBe('it-english-adult');

    const manifest = await storage.readPackageManifest('it-english-adult');
    expect(manifest.lessons[0].scripts[0].standardL2).toBe('Hi.');

    const readAudio = await storage.readPackageAudio('it-english-adult', 0, 0);
    expect(Array.from(readAudio)).toEqual([1, 2, 3, 4]);

    const readImage = await storage.readPackageImage('it-english-adult', 0);
    expect(readImage && Array.from(readImage)).toEqual([9, 9]);

    const list = await storage.listPackages();
    expect(list.map((p) => p.slug)).toContain('it-english-adult');
  });
});

describe('record append flows (PouchDB)', () => {
  const PACKAGE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(async () => {
    const storage = await freshStorage();
    await storage.writePackage({
      manifest: baseManifest('it-english-adult', PACKAGE_ID),
      audio: new Map([['audio/l0s0.mp3', Uint8Array.from([0])]]),
      images: new Map(),
    });
  });

  it('appends attempts and serializes Phase-2 fields as null', async () => {
    const storage = await freshStorage();
    await storage.appendAttempt('it-english-adult', PACKAGE_ID, 0, 0, {
      transcription: 'Hi.',
      overallScore: 85,
      pronunciation: 90,
      logicStress: 80,
      feedback: 'Nice stress.',
    });

    const record = await storage.readRecord('it-english-adult');
    expect(record).not.toBeNull();
    const attempt = record!.lessons[0].scripts[0].attempts[0];
    expect(attempt.overallScore).toBe(85);
    expect(attempt.scoreCoreAction).toBeNull();
  });

  it('handles concurrent appends (PouchDB conflict resolution)', async () => {
    // 增加并发量以触发冲突测试
    const storage = await freshStorage();
    const count = 10;
    const writes = Array.from({ length: count }, (_, i) =>
      storage.appendAttempt('it-english-adult', PACKAGE_ID, 0, 0, {
        transcription: `attempt ${i}`,
        overallScore: i * 10,
        pronunciation: 50,
        logicStress: 50,
        feedback: 'ok',
      }),
    );
    await Promise.all(writes);

    const record = await storage.readRecord('it-english-adult');
    // PouchDB 应该能处理并发写入日志的情况
    expect(record!.lessons[0].scripts[0].attempts).toHaveLength(count);
  });

  it('appends a transform to the global record', async () => {
    const storage = await freshStorage();
    await storage.appendTransform(null, {
      inputText: '我去会议',
      sourceLang: 'Chinese',
      targetLang: 'English',
      cfltL1: '[Core: 我去] [Space: 会议]',
      cfltL2: '[Core: I go] [Space: meeting]',
      standardL2: 'I am going to the meeting.',
    });
    const record = await storage.readGlobalRecord();
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

    await storage.upsertRoleplaySession(null, {
      ...input,
      newMessages: [
        { role: 'user', content: 'hi', createdAt: '2026-05-08T10:00:00.000Z' },
      ],
    });
    
    await storage.upsertRoleplaySession(null, {
      ...input,
      newMessages: [
        { role: 'assistant', content: 'hello', createdAt: '2026-05-08T10:00:01.000Z' },
      ],
    });

    const record = await storage.readGlobalRecord();
    expect(record!.roleplaySessions).toHaveLength(1);
    expect(record!.roleplaySessions[0].messages).toHaveLength(2);
  });
});
