import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaImageProvider } from '@/src/core/visuals/ollama-provider';
import { QwenVisualProvider } from '@/src/core/visuals/qwen-provider';
import { AISDKImageProvider } from '@/src/core/visuals/imagen-provider';
import { generateImage } from 'ai';

// Mock AI SDK
vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

describe('Visual Providers Size Support', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.clearAllMocks();
  });

  describe('OllamaImageProvider', () => {
    const baseUrl = 'http://localhost:11434';

    it('passes size to V1 endpoint', async () => {
      const provider = new OllamaImageProvider(`${baseUrl}/v1`, 'model');
      (fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{"data":[{"b64_json":"fake"}]}'),
      });

      await provider.generateImage('cat', { size: '896x512' });

      const lastCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(lastCall[1]?.body as string);
      expect(body.size).toBe('896x512');
    });

    it('parses width and height for native API fallback', async () => {
      const provider = new OllamaImageProvider(baseUrl, 'model');
      
      // Force fallback by making V1 fail
      (fetch as any).mockImplementation((url: string) => {
        if (url.includes('/v1/')) return Promise.resolve({ ok: false });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: 'fake' }),
        });
      });

      await provider.generateImage('cat', { size: '896x512' });

      const nativeCall = vi.mocked(fetch).mock.calls.find(call => call[0].includes('/api/generate'));
      const body = JSON.parse(nativeCall![1]?.body as string);
      expect(body.options.width).toBe(896);
      expect(body.options.height).toBe(512);
    });
  });

  describe('QwenVisualProvider', () => {
    it('maps 896x512 to closest supported 1280*720', async () => {
      const provider = new QwenVisualProvider('key');
      // Mock pollTask to avoid actual polling
      vi.spyOn(provider as any, 'pollTask').mockResolvedValue('data:image/png;base64,fake');
      
      (fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ output: { task_id: '123' } })),
      });

      await provider.generateImage('cat', { size: '896x512' });

      const lastCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(lastCall[1]?.body as string);
      expect(body.parameters.size).toBe('1280*720');
    });

    it('passes supported size directly (with * replacement)', async () => {
      const provider = new QwenVisualProvider('key');
      vi.spyOn(provider as any, 'pollTask').mockResolvedValue('data:image/png;base64,fake');
      
      (fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ output: { task_id: '123' } })),
      });

      await provider.generateImage('cat', { size: '1280x720' });

      const lastCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(lastCall[1]?.body as string);
      expect(body.parameters.size).toBe('1280*720');
    });
  });

  describe('AISDKImageProvider', () => {
    it('passes size to AI SDK generateImage', async () => {
      const mockModel = { modelId: 'test-model' } as any;
      const provider = new AISDKImageProvider(mockModel);
      (generateImage as any).mockResolvedValue({
        image: { base64: 'fake', mediaType: 'image/png' }
      });

      await provider.generateImage('cat', { size: '896x512' });

      expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({
        size: '896x512'
      }));
    });

    it('maps 896x512 to 16:9 for imagen models', async () => {
      const mockModel = { modelId: 'imagen-3' } as any;
      const provider = new AISDKImageProvider(mockModel);
      (generateImage as any).mockResolvedValue({
        image: { base64: 'fake', mediaType: 'image/png' }
      });

      await provider.generateImage('cat', { size: '896x512' });

      expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({
        aspectRatio: '16:9'
      }));
    });
  });
});
