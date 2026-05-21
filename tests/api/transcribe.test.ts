import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/transcribe/route';
import { STTFactory } from '@/src/core/stt/factory';

vi.mock('@/src/core/stt/factory', () => ({
  STTFactory: {
    getProvider: vi.fn(),
  },
}));

vi.mock('@/src/lib/ai/settings-config', () => ({
  extractSettings: vi.fn().mockReturnValue({}),
  resolveSTTOverride: vi.fn(),
}));

describe('/api/transcribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if audio is missing', async () => {
    const formData = new FormData();
    const request = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns transcription result on success', async () => {
    const mockAudio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', mockAudio);

    const mockProvider = {
        transcribe: vi.fn().mockResolvedValue({ text: 'Hello world' }),
    };
    vi.mocked(STTFactory.getProvider).mockReturnValue(mockProvider as any);

    const request = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.text).toBe('Hello world');
  });
});
