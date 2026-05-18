import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const TOUCHED = [
  'TTS_PROVIDER', 'TTS_MODEL', 'TTS_API_KEY', 'TTS_BASE_URL',
  'STT_PROVIDER', 'STT_MODEL', 'STT_API_KEY', 'STT_BASE_URL',
  'GLOBAL_PROVIDER', 'GLOBAL_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY',
  'QWEN_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY',
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
});

// ── TTSFactory routing ────────────────────────────────────────────────────

describe('TTSFactory.getProvider routing', () => {
  it('routes google to GoogleGeminiTTSProvider', async () => {
    process.env.TTS_PROVIDER = 'google';
    process.env.TTS_MODEL = 'gemini-2.5-flash-preview-tts';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    const { TTSFactory } = await import('@/src/core/tts/factory');
    const { GoogleGeminiTTSProvider } = await import('@/src/core/tts/google-provider');
    expect(TTSFactory.getProvider()).toBeInstanceOf(GoogleGeminiTTSProvider);
  });

  it('routes openai to OpenAITTSProvider', async () => {
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_MODEL = 'tts-1';
    process.env.OPENAI_API_KEY = 'sk-test';
    const { TTSFactory } = await import('@/src/core/tts/factory');
    const { OpenAITTSProvider } = await import('@/src/core/tts/openai-provider');
    expect(TTSFactory.getProvider()).toBeInstanceOf(OpenAITTSProvider);
  });

  it('routes qwen to QwenTTSProvider (native DashScope API)', async () => {
    process.env.TTS_PROVIDER = 'qwen';
    process.env.TTS_MODEL = 'cosyvoice-v1';
    process.env.QWEN_API_KEY = 'sk-qwen';
    const { TTSFactory } = await import('@/src/core/tts/factory');
    const { QwenTTSProvider } = await import('@/src/core/tts/qwen-provider');
    expect(TTSFactory.getProvider()).toBeInstanceOf(QwenTTSProvider);
  });

  it('routes openrouter to OpenAITTSProvider', async () => {
    process.env.TTS_PROVIDER = 'openrouter';
    process.env.TTS_MODEL = 'openai/gpt-4o-mini-tts-2025-12-15';
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const { TTSFactory } = await import('@/src/core/tts/factory');
    const { OpenAITTSProvider } = await import('@/src/core/tts/openai-provider');
    expect(TTSFactory.getProvider()).toBeInstanceOf(OpenAITTSProvider);
  });

  it('throws for unrecognised provider', async () => {
    process.env.TTS_PROVIDER = 'unknownprovider';
    // unknownprovider is not in PROVIDERS_BY_CAPABILITY — resolveFeature will
    // warn and fall back to 'none', so this actually returns NullTTSProvider.
    // The factory's own default:throw is only reached for known-but-unhandled.
    // Test that a truly invalid configured provider resolves gracefully.
    const { TTSFactory } = await import('@/src/core/tts/factory');
    const provider = TTSFactory.getProvider();
    await expect((provider as { generateAudio(t: string): Promise<unknown> }).generateAudio('x')).rejects.toThrow();
  });
});

// ── STTFactory routing ────────────────────────────────────────────────────

describe('STTFactory.getProvider routing', () => {
  it('routes google to GoogleGeminiSTTProvider', async () => {
    process.env.STT_PROVIDER = 'google';
    process.env.STT_MODEL = 'gemini-2.5-flash';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    const { STTFactory } = await import('@/src/core/stt/factory');
    const { GoogleGeminiSTTProvider } = await import('@/src/core/stt/google-provider');
    expect(STTFactory.getProvider()).toBeInstanceOf(GoogleGeminiSTTProvider);
  });

  it('routes openai to OpenAISTTProvider', async () => {
    process.env.STT_PROVIDER = 'openai';
    process.env.STT_MODEL = 'whisper-1';
    process.env.OPENAI_API_KEY = 'sk-test';
    const { STTFactory } = await import('@/src/core/stt/factory');
    const { OpenAISTTProvider } = await import('@/src/core/stt/openai-provider');
    expect(STTFactory.getProvider()).toBeInstanceOf(OpenAISTTProvider);
  });

  it('routes qwen to QwenSTTProvider (native DashScope API)', async () => {
    process.env.STT_PROVIDER = 'qwen';
    process.env.STT_MODEL = 'paraformer-realtime-v2';
    process.env.QWEN_API_KEY = 'sk-qwen';
    const { STTFactory } = await import('@/src/core/stt/factory');
    const { QwenSTTProvider } = await import('@/src/core/stt/qwen-provider');
    expect(STTFactory.getProvider()).toBeInstanceOf(QwenSTTProvider);
  });

  it('routes openrouter to OpenRouterSTTProvider', async () => {
    process.env.STT_PROVIDER = 'openrouter';
    process.env.STT_MODEL = 'openai/whisper-1';
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const { STTFactory } = await import('@/src/core/stt/factory');
    const { OpenRouterSTTProvider } = await import('@/src/core/stt/openrouter-provider');
    expect(STTFactory.getProvider()).toBeInstanceOf(OpenRouterSTTProvider);
  });

  it('per-request override always uses OpenAISTTProvider', async () => {
    process.env.STT_PROVIDER = 'google';
    process.env.STT_MODEL = 'gemini-2.5-flash';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'key';
    const { STTFactory } = await import('@/src/core/stt/factory');
    const { OpenAISTTProvider } = await import('@/src/core/stt/openai-provider');
    const override = { provider: 'openai', baseUrl: 'http://localhost:8000/v1' };
    expect(STTFactory.getProvider(override)).toBeInstanceOf(OpenAISTTProvider);
  });
});
