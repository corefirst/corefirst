import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── env save/restore ──────────────────────────────────────────────────────
const TOUCHED = [
  'TTS_PROVIDER', 'TTS_MODEL', 'TTS_API_KEY',
  'STT_PROVIDER', 'STT_MODEL', 'STT_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY',
  'GLOBAL_API_KEY', 'GLOBAL_PROVIDER'
];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of TOUCHED) { saved[k] = process.env[k]; delete process.env[k]; }
  vi.resetModules();
});

afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  const response = { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

function pcmPayload(b64Pcm: string) {
  return {
    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/pcm', data: b64Pcm } }] } }],
  };
}

function transcriptionPayload(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

// 8 bytes of silent 16-bit PCM (4 zero samples)
const SILENT_PCM_B64 = Buffer.alloc(8).toString('base64');

// ── GoogleGeminiTTSProvider ───────────────────────────────────────────────

describe('GoogleGeminiTTSProvider', () => {
  async function makeProvider(opts?: { model?: string; apiKey?: string }) {
    process.env.TTS_PROVIDER = 'google';
    process.env.TTS_MODEL = opts?.model ?? 'gemini-2.5-flash-preview-tts';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = opts?.apiKey ?? 'test-key';
    vi.resetModules();
    const { GoogleGeminiTTSProvider } = await import('@/src/core/tts/google-provider');
    return new GoogleGeminiTTSProvider();
  }

  it('returns a WAV Uint8Array on success', async () => {
    mockFetch(pcmPayload(SILENT_PCM_B64));
    const provider = await makeProvider();
    const wav = await provider.generateAudio('Hello world');
    // WAV magic bytes: RIFF
    expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe('RIFF');
    // WAV WAVE marker at offset 8
    expect(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])).toBe('WAVE');
  });

  it('calls the correct Gemini endpoint with the model name', async () => {
    mockFetch(pcmPayload(SILENT_PCM_B64));
    const provider = await makeProvider({ model: 'gemini-2.5-pro-tts' });
    await provider.generateAudio('Test');
    const [url] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('gemini-2.5-pro-tts');
    expect(url).toContain('key=test-key');
  });

  it('strips HTML markup before sending text', async () => {
    mockFetch(pcmPayload(SILENT_PCM_B64));
    const provider = await makeProvider();
    await provider.generateAudio('<b>Hello</b> &amp; world');
    const [, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toBe('Hello & world');
  });

  it('throws a clear error on HTTP failure', async () => {
    mockFetch({ error: { message: 'API_KEY_INVALID' } }, 400);
    const provider = await makeProvider();
    await expect(provider.generateAudio('test')).rejects.toThrow(/Gemini TTS HTTP 400/);
  });

  it('throws when response has no inline audio data', async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: 'oops' }] } }] });
    const provider = await makeProvider();
    await expect(provider.generateAudio('test')).rejects.toThrow(/no inline audio data/);
  });

  it('falls back to GOOGLE_GENERATIVE_AI_API_KEY when GOOGLE_API_KEY is absent', async () => {
    mockFetch(pcmPayload(SILENT_PCM_B64));
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'generative-key';
    // GOOGLE_API_KEY and GLOBAL_API_KEY deliberately absent
    const { GoogleGeminiTTSProvider } = await import('@/src/core/tts/google-provider');
    const provider = new GoogleGeminiTTSProvider({ model: 'gemini-2.5-flash-preview-tts' });
    await provider.generateAudio('hello');
    const [url] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('key=generative-key');
  });
});

// ── GoogleGeminiSTTProvider ───────────────────────────────────────────────

describe('GoogleGeminiSTTProvider', () => {
  async function makeProvider(opts?: { model?: string; apiKey?: string }) {
    process.env.STT_PROVIDER = 'google';
    process.env.STT_MODEL = opts?.model ?? 'gemini-2.5-flash';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = opts?.apiKey ?? 'test-key';
    vi.resetModules();
    const { GoogleGeminiSTTProvider } = await import('@/src/core/stt/google-provider');
    return new GoogleGeminiSTTProvider();
  }

  const WAV_BYTES = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00, // chunk size
    0x57, 0x41, 0x56, 0x45, // WAVE
  ]);

  it('returns transcription text on success', async () => {
    mockFetch(transcriptionPayload('Hello world'));
    const provider = await makeProvider();
    const { text } = await provider.transcribe(WAV_BYTES);
    expect(text).toBe('Hello world');
  });

  it('calls the correct Gemini endpoint', async () => {
    mockFetch(transcriptionPayload('hi'));
    const provider = await makeProvider({ model: 'gemini-2.5-pro' });
    await provider.transcribe(WAV_BYTES);
    const [url] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('gemini-2.5-pro');
    expect(url).toContain('key=test-key');
  });

  it('includes language hint in prompt when provided', async () => {
    mockFetch(transcriptionPayload('你好'));
    const provider = await makeProvider();
    await provider.transcribe(WAV_BYTES, { language: 'zh' });
    const [, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const promptText = body.contents[0].parts[1].text as string;
    expect(promptText).toContain('Chinese');
  });

  it('omits language hint for unknown language codes', async () => {
    mockFetch(transcriptionPayload('something'));
    const provider = await makeProvider();
    await provider.transcribe(WAV_BYTES, { language: 'xx' });
    const [, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const promptText = body.contents[0].parts[1].text as string;
    expect(promptText).not.toContain('The audio is in');
  });

  it('sniffs WAV mime type correctly', async () => {
    mockFetch(transcriptionPayload('ok'));
    const provider = await makeProvider();
    await provider.transcribe(WAV_BYTES);
    const [, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('audio/wav');
  });

  it('throws on HTTP error', async () => {
    mockFetch({ error: 'quota exceeded' }, 429);
    const provider = await makeProvider();
    await expect(provider.transcribe(WAV_BYTES)).rejects.toThrow(/Gemini STT HTTP 429/);
  });

  it('throws when response has no text', async () => {
    mockFetch({ candidates: [{ content: { parts: [] } }] });
    const provider = await makeProvider();
    await expect(provider.transcribe(WAV_BYTES)).rejects.toThrow(/no transcription text/);
  });

  it('falls back to GOOGLE_GENERATIVE_AI_API_KEY', async () => {
    mockFetch(transcriptionPayload('ok'));
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'generative-key';
    const { GoogleGeminiSTTProvider } = await import('@/src/core/stt/google-provider');
    const provider = new GoogleGeminiSTTProvider({ model: 'gemini-2.5-flash' });
    await provider.transcribe(WAV_BYTES);
    const [url] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('key=generative-key');
  });
});
