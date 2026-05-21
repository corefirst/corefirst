import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/transform/route';
import { CFLTTransformer } from '@/src/core/transformer';
import { resolveTextContext } from '@/src/lib/ai/request-context';
import { appendTransform } from '@/src/lib/storage';

vi.mock('@/src/core/transformer', () => ({
  CFLTTransformer: vi.fn(),
}));

vi.mock('@/src/lib/ai/request-context', () => ({
  resolveTextContext: vi.fn(),
}));

vi.mock('@/src/lib/storage', () => ({
  appendTransform: vi.fn(),
}));

describe('/api/transform route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if text is missing', async () => {
    const request = new Request('http://localhost/api/transform', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('text is required');
  });

  it('returns transformation result on success', async () => {
    const mockResult = {
      cflt_l1: 'L1',
      cflt_l2: 'L2',
      standard_l2: 'S2',
      is_cflt_compliant: true,
    };

    vi.mocked(resolveTextContext).mockResolvedValue({ userId: 'user-1' } as any);
    
    const mockTransform = vi.fn().mockResolvedValue(mockResult);
    vi.mocked(CFLTTransformer).mockImplementation(function (this: any) {
      this.transform = mockTransform;
    } as any);

    const request = new Request('http://localhost/api/transform', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual(mockResult);
    
    expect(mockTransform).toHaveBeenCalledWith('hello', undefined, undefined, undefined, 'user-1');
    expect(appendTransform).toHaveBeenCalled();
  });

  it('returns 500 if transformer returns an error', async () => {
    vi.mocked(resolveTextContext).mockResolvedValue({ userId: 'user-1' } as any);
    
    const mockTransform = vi.fn().mockResolvedValue({ error: 'Failed' });
    vi.mocked(CFLTTransformer).mockImplementation(function (this: any) {
      this.transform = mockTransform;
    } as any);

    const request = new Request('http://localhost/api/transform', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Transformation failed');
  });
});
