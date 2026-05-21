import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/generate-course/route';
import { CoursewareOrchestrator } from '@/src/generator/orchestrator';
import { buildAndWritePackage } from '@/src/generator/package-builder';
import { getUserId } from '@/src/lib/auth/user';

vi.mock('@/src/generator/orchestrator', () => ({
  CoursewareOrchestrator: vi.fn(),
}));

vi.mock('@/src/generator/package-builder', () => ({
  buildAndWritePackage: vi.fn(),
}));

vi.mock('@/src/lib/auth/user', () => ({
  getUserId: vi.fn(),
}));

// Mock settings-config to avoid issues with request extraction
vi.mock('@/src/lib/ai/settings-config', () => ({
  extractSettings: vi.fn().mockReturnValue({}),
  resolveFeatureFromSettings: vi.fn(),
  resolveTTSOverride: vi.fn(),
  resolveImageOverride: vi.fn(),
}));

describe('/api/generate-course route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if body is invalid', async () => {
    const request = new Request('http://localhost/api/generate-course', {
      method: 'POST',
      body: JSON.stringify({ topic: '' }), // age_group missing
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('emits events and completes on success', async () => {
    vi.mocked(getUserId).mockResolvedValue('user-1');
    
    const mockGenerate = vi.fn().mockImplementation(async (params, userId) => {
        return { topic: 'Zoo', lessons: [] };
    });

    vi.mocked(CoursewareOrchestrator).mockImplementation(function (this: any, model: any, emit: any) {
      this.generate = mockGenerate;
    } as any);

    vi.mocked(buildAndWritePackage).mockResolvedValue({ packageId: 'pkg-1', slug: 'zoo' } as any);

    const request = new Request('http://localhost/api/generate-course', {
      method: 'POST',
      body: JSON.stringify({ topic: 'Zoo', age_group: 'Child' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let output = '';
    
    while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        output += decoder.decode(value);
    }

    expect(output).toContain('complete');
    expect(output).toContain('zoo');
  });
});
