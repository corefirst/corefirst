import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/tts/route';
import { TTSFactory } from '@/src/core/tts/factory';
import * as fs from 'fs/promises';
import { contentHash } from '@/src/lib/storage/hash';
import { sharedMediaPath } from '@/src/lib/storage/paths';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('@/src/core/tts/factory', () => ({
  TTSFactory: {
    getProvider: vi.fn(),
  },
}));

vi.mock('@/src/lib/storage/hash', () => ({
  contentHash: vi.fn().mockReturnValue('mock-hash'),
}));

vi.mock('@/src/lib/storage/paths', () => ({
  sharedMediaPath: vi.fn().mockReturnValue('/tmp/mock.mp3'),
  ensureDataDirs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/src/lib/ai/settings-config', () => ({
  extractSettings: vi.fn().mockReturnValue({}),
  resolveTTSOverride: vi.fn(),
}));

describe('/api/tts route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if text is missing', async () => {
    const request = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns cached audio on HIT', async () => {
    const mockAudio = new Uint8Array([1, 2, 3]);
    vi.mocked(fs.readFile).mockResolvedValue(mockAudio as any);

    const request = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache')).toBe('HIT');
    const data = new Uint8Array(await response.arrayBuffer());
    expect(data).toEqual(mockAudio);
  });

  it('generates and saves audio on MISS', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    
    const mockAudio = new Uint8Array([4, 5, 6]);
    const mockProvider = {
        generateAudio: vi.fn().mockResolvedValue(mockAudio.buffer),
    };
    vi.mocked(TTSFactory.getProvider).mockReturnValue(mockProvider as any);

    const request = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache')).toBe('MISS');
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/mock.mp3', expect.any(Uint8Array));
  });
});
