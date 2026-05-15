import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaImageProvider } from '@/src/core/visuals/ollama-provider';

describe('OllamaImageProvider Hardened Logic', () => {
  const baseUrl = 'http://localhost:11434/v1';
  
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('automatically appends :latest if model tag is missing', async () => {
    const provider = new OllamaImageProvider(baseUrl, 'x/z-image-turbo');
    
    (vi.mocked(fetch) as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/x-ndjson']]),
      text: () => Promise.resolve('{"done":true, "data":[{"b64_json":"fake"}]}'),
    });

    await provider.generateImage('cat');

    // 验证 fetch 调用时的 model 名是否补全了 :latest
    const lastCall = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(lastCall[1]?.body as string);
    expect(body.model).toBe('x/z-image-turbo:latest');
  });

  it('preserves existing model tag if present', async () => {
    const provider = new OllamaImageProvider(baseUrl, 'my-model:v1.0');
    
    (vi.mocked(fetch) as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([]),
      text: () => Promise.resolve('{"data":[{"b64_json":"fake"}]}'),
    });

    await provider.generateImage('cat');

    const lastCall = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(lastCall[1]?.body as string);
    expect(body.model).toBe('my-model:v1.0');
  });

  it('includes Authorization header when apiKey is provided', async () => {
    const provider = new OllamaImageProvider(baseUrl, 'x/z-image-turbo', 'my-secret-key');
    
    (vi.mocked(fetch) as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([]),
      text: () => Promise.resolve('{"data":[{"b64_json":"fake"}]}'),
    });

    await provider.generateImage('cat');

    const lastCall = vi.mocked(fetch).mock.calls[0];
    const headers = lastCall[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-secret-key');
  });

  it('parses real-world multi-line NDJSON correctly', async () => {
    const provider = new OllamaImageProvider(baseUrl, 'x/z-image-turbo');
    
    // 模拟真实的 Ollama NDJSON 输出：多行，最后一行包含数据
    const multiLineNdjson = 
      '{"model":"x/z-image-turbo:latest","done":false}\n' +
      '{"model":"x/z-image-turbo:latest","done":false}\n' +
      '{"data":[{"b64_json":"SUCCESS_DATA"}],"done":true}\n';

    (vi.mocked(fetch) as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/x-ndjson']]),
      text: () => Promise.resolve(multiLineNdjson),
    });

    const result = await provider.generateImage('cat');
    expect(result).toBe('data:image/webp;base64,SUCCESS_DATA');
  });

  it('throws a specific error for zero-byte responses', async () => {
    const provider = new OllamaImageProvider(baseUrl, 'x/z-image-turbo');
    
    (vi.mocked(fetch) as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([]),
      text: () => Promise.resolve(''), // 模拟 0 字节返回
    });

    await expect(provider.generateImage('cat')).rejects.toThrow('Ollama: Empty response (possible model crash)');
  });
});
