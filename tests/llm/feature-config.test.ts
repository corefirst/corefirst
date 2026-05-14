import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We mutate process.env in this suite, so save/restore around each test to
// avoid bleeding env state between cases. We intentionally clear *all* the
// vars the resolver looks at; no test should be sensitive to outside env.

const TOUCHED_VARS = [
  'GLOBAL_PROVIDER',
  'GLOBAL_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'TEXT_PROVIDER',
  'TEXT_MODEL',
  'TEXT_BASE_URL',
  'TEXT_API_KEY',
  'TEXT_TO_IMAGE_PROVIDER',
  'TEXT_TO_IMAGE_MODEL',
  'TEXT_TO_SPEECH_PROVIDER',
  'TEXT_TO_SPEECH_MODEL',
  'TEXT_TO_SPEECH_BASE_URL',
  'SPEECH_TO_TEXT_PROVIDER',
  'SPEECH_TO_TEXT_MODEL',
  'SPEECH_TO_TEXT_BASE_URL',
  'TRANSFORM_PROVIDER',
  'TRANSFORM_MODEL',
  'TRANSFORM_BASE_URL',
  'TRANSFORM_API_KEY',
  'COURSE_GEN_PROVIDER',
  'COURSE_GEN_MODEL',
  'ROLEPLAY_PROVIDER',
  'ROLEPLAY_MODEL',
  'SPEECH_EVAL_PROVIDER',
  'SPEECH_EVAL_MODEL',
  'IMAGE_GEN_PROVIDER',
  'IMAGE_GEN_MODEL',
  'TTS_PROVIDER',
  'TTS_MODEL',
  'TTS_BASE_URL',
  'TTS_API_KEY',
  'STT_PROVIDER',
  'STT_MODEL',
  'STT_BASE_URL',
  'STT_API_KEY',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of TOUCHED_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of TOUCHED_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function fresh() {
  const { vi } = await import('vitest');
  vi.resetModules();
  // Import the metadata + resolver sub-paths directly. Importing the top-level
  // `@/src/lib/ai` eagerly constructs all feature models (e.g. transformModel
  // via buildTextModelFor('transform')), which would throw before we get a
  // chance to assert against bad config in these tests.
  const config = await import('@/src/lib/ai/config');
  const capabilities = await import('@/src/lib/ai/capabilities');
  const ttv = await import('@/src/lib/ai/text-to-video/factory');
  const itv = await import('@/src/lib/ai/image-to-video/factory');
  const mtv = await import('@/src/lib/ai/multimodal-to-video/factory');
  return {
    resolveFeature: config.resolveFeature,
    FEATURES: capabilities.FEATURES,
    InvalidProviderError: capabilities.InvalidProviderError,
    buildTextToVideoModel: ttv.buildTextToVideoModel,
    buildImageToVideoModel: itv.buildImageToVideoModel,
    buildMultimodalToVideoModel: mtv.buildMultimodalToVideoModel,
  };
}

describe('resolveFeature — precedence', () => {
  it('uses baked-in default when nothing is set', async () => {
    const { resolveFeature } = await fresh();
    expect(resolveFeature('transform').provider).toBe('none');
    expect(resolveFeature('roleplay').provider).toBe('none');
    expect(resolveFeature('imageGen').provider).toBe('none');
    expect(resolveFeature('tts').provider).toBe('none');
    expect(resolveFeature('stt').provider).toBe('none');
  });

  it('capability-level provider overrides baked-in default', async () => {
    process.env.TEXT_PROVIDER = 'anthropic';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('transform').provider).toBe('anthropic');
    expect(resolveFeature('roleplay').provider).toBe('anthropic');
    // Model picks up Anthropic's default from PROVIDER_DEFAULTS
    expect(resolveFeature('transform').model).toBe('claude-sonnet-4-6');
  });

  it('feature-level provider overrides capability-level', async () => {
    process.env.TEXT_PROVIDER = 'anthropic';
    process.env.ROLEPLAY_PROVIDER = 'cli/claude';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('transform').provider).toBe('anthropic');
    expect(resolveFeature('roleplay').provider).toBe('cli/claude');
  });

  it('feature-level model overrides default model', async () => {
    process.env.ROLEPLAY_MODEL = 'gemini-3-flash-preview-002';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('roleplay').model).toBe('gemini-3-flash-preview-002');
  });

  it('capability-level model overrides baked-in default and is overridden by feature', async () => {
    process.env.TEXT_MODEL = 'capability-shared-model';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('transform').model).toBe('capability-shared-model');
    expect(resolveFeature('courseGen').model).toBe('capability-shared-model');
    expect(resolveFeature('roleplay').model).toBe('capability-shared-model');
    expect(resolveFeature('speechEval').model).toBe('capability-shared-model');
    // Image / TTS / STT are different capabilities and should NOT pick up TEXT_MODEL.
    expect(resolveFeature('imageGen').model).toBe('imagen-4.0-generate-001');
    expect(resolveFeature('tts').model).toBe('gpt-4o-mini-tts');
  });

  it('feature-level model wins over capability-level model', async () => {
    process.env.TEXT_MODEL = 'capability-shared-model';
    process.env.TRANSFORM_MODEL = 'transform-specific-model';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('transform').model).toBe('transform-specific-model');
    expect(resolveFeature('courseGen').model).toBe('capability-shared-model');
  });

  it('fallback to none for an invalid provider for a capability', async () => {
    process.env.IMAGE_GEN_PROVIDER = 'cli/claude';
    const { resolveFeature } = await fresh();
    // cli/claude is text-only. It should failover to none.
    expect(resolveFeature('imageGen').provider).toBe('none');
  });

  it('fallback to none for unsupported capability (ollama for TTS)', async () => {
    process.env.TTS_PROVIDER = 'ollama';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('tts').provider).toBe('none');
  });

  it('fallback to none for unsupported capability (ollama for STT)', async () => {
    process.env.STT_PROVIDER = 'ollama';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('stt').provider).toBe('none');
  });
});

describe('resolveFeature — GLOBAL_PROVIDER and Mix-and-Match', () => {
  it('GLOBAL_PROVIDER=google sets defaults for all four standard capabilities', async () => {
    process.env.GLOBAL_PROVIDER = 'google';
    const { resolveFeature } = await fresh();

    expect(resolveFeature('transform')).toMatchObject({
      provider: 'google',
      model: 'gemini-2.5-pro',
    });
    expect(resolveFeature('imageGen')).toMatchObject({
      provider: 'google',
      model: 'imagen-4.0-generate-001',
    });
    // Gemini natively serves TTS and STT (gemini-2.5-flash-preview-tts / gemini-2.5-flash).
    // They route through src/core/{tts,stt}/google-provider.ts rather than the AI-SDK
    // SpeechModel/TranscriptionModel path — but config still picks 'google' for them.
    expect(resolveFeature('tts')).toMatchObject({
      provider: 'google',
      model: 'gemini-2.5-flash-preview-tts',
    });
    expect(resolveFeature('stt')).toMatchObject({
      provider: 'google',
      model: 'gemini-2.5-flash',
    });
  });

  it('GLOBAL_PROVIDER=openai sets defaults for all capabilities', async () => {
    process.env.GLOBAL_PROVIDER = 'openai';
    const { resolveFeature } = await fresh();
    
    expect(resolveFeature('transform')).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
    });
    expect(resolveFeature('imageGen')).toMatchObject({
      provider: 'openai',
      model: 'dall-e-3',
    });
    expect(resolveFeature('tts')).toMatchObject({
      provider: 'openai',
      model: 'tts-1',
    });
  });

  it('Feature override wins over GLOBAL_PROVIDER (Mix-and-Match)', async () => {
    process.env.GLOBAL_PROVIDER = 'google';
    process.env.TTS_PROVIDER = 'openai'; // Explicitly override for one feature
    const { resolveFeature } = await fresh();
    
    expect(resolveFeature('transform').provider).toBe('google');
    expect(resolveFeature('tts')).toMatchObject({
      provider: 'openai',
      model: 'tts-1', // Picks up OpenAI's default for TTS
    });
  });

  it('API Key precedence: Feature > Capability > Provider-Specific > Global', async () => {
    process.env.GLOBAL_PROVIDER = 'openai';
    process.env.GLOBAL_API_KEY = 'global-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.TEXT_API_KEY = 'text-cap-key';
    process.env.TRANSFORM_API_KEY = 'transform-feat-key';

    const { resolveFeature } = await fresh();
    
    // transform has feat-level key
    expect(resolveFeature('transform').apiKey).toBe('transform-feat-key');
    
    // courseGen has no feat-level, so it picks up text-cap-key
    expect(resolveFeature('courseGen').apiKey).toBe('text-cap-key');

    // imageGen has no feat or cap, so it picks up openai-key
    expect(resolveFeature('imageGen').apiKey).toBe('openai-key');

    // If we delete all specific ones, it hits global-key
    delete process.env.TRANSFORM_API_KEY;
    delete process.env.TEXT_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { resolveFeature: resolve2 } = await fresh();
    expect(resolve2('transform').apiKey).toBe('global-key');
  });
});

describe('resolveFeature — base URL / API key', () => {
  it('returns undefined baseUrl when nothing is set', async () => {
    const { resolveFeature } = await fresh();
    expect(resolveFeature('tts').baseUrl).toBeUndefined();
    expect(resolveFeature('tts').apiKey).toBeUndefined();
  });

  it('feature-level BASE_URL wins over capability-level', async () => {
    process.env.TEXT_TO_SPEECH_BASE_URL = 'http://capability:8000/v1';
    process.env.TTS_BASE_URL = 'http://feature:8880/v1';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('tts').baseUrl).toBe('http://feature:8880/v1');
  });

  it('capability-level BASE_URL applies when feature-level is unset', async () => {
    process.env.TEXT_TO_SPEECH_BASE_URL = 'http://capability:8000/v1';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('tts').baseUrl).toBe('http://capability:8000/v1');
  });

  it('feature-level API_KEY wins over capability-level', async () => {
    process.env.SPEECH_TO_TEXT_API_KEY = 'cap-key';
    process.env.STT_API_KEY = 'feat-key';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('stt').apiKey).toBe('feat-key');
  });

  it('local TTS scenario: openai provider + custom base URL', async () => {
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_MODEL = 'kokoro';
    process.env.TTS_BASE_URL = 'http://localhost:8880/v1';
    const { resolveFeature } = await fresh();
    const r = resolveFeature('tts');
    expect(r.provider).toBe('openai');
    expect(r.model).toBe('kokoro');
    expect(r.baseUrl).toBe('http://localhost:8880/v1');
  });

  it('local Ollama image gen scenario: openai provider + Ollama /v1', async () => {
    // Ollama exposes an experimental OpenAI-compatible /v1/images/generations
    // endpoint, so imageGen plugs in via the standard `openai` provider with
    // a custom base URL. No new provider name needed.
    process.env.IMAGE_GEN_PROVIDER = 'openai';
    process.env.IMAGE_GEN_MODEL = 'x/z-image-turbo:latest';
    process.env.IMAGE_GEN_BASE_URL = 'http://localhost:11434/v1';
    process.env.IMAGE_GEN_API_KEY = 'ollama';
    const { resolveFeature } = await fresh();
    const r = resolveFeature('imageGen');
    expect(r.provider).toBe('openai');
    expect(r.model).toBe('x/z-image-turbo:latest');
    expect(r.baseUrl).toBe('http://localhost:11434/v1');
    expect(r.apiKey).toBe('ollama');
  });

  it('fallback to none for a fictitious provider', async () => {
    process.env.TRANSFORM_PROVIDER = 'fakeprovider';
    const { resolveFeature } = await fresh();
    expect(resolveFeature('transform').provider).toBe('none');
  });
});

describe('resolveFeature — full feature surface', () => {
  it('returns one entry per declared feature', async () => {
    const { FEATURES, resolveFeature } = await fresh();
    const keys = Object.keys(FEATURES) as Array<keyof typeof FEATURES>;
    expect(keys).toEqual(['transform', 'courseGen', 'roleplay', 'speechEval', 'imageGen', 'tts', 'stt']);
    for (const key of keys) {
      const r = resolveFeature(key);
      expect(r.feature).toBe(key);
      expect(r.provider).toBeTruthy();
      expect(r.model).toBeTruthy();
    }
  });
});

describe('NotImplementedError stubs', () => {
  it('throws when calling text-to-video / image-to-video / multimodal-to-video', async () => {
    const ai = await fresh();
    expect(() => ai.buildTextToVideoModel()).toThrow(/text-to-video/);
    expect(() => ai.buildImageToVideoModel()).toThrow(/image-to-video/);
    expect(() => ai.buildMultimodalToVideoModel()).toThrow(/multimodal-to-video/);
  });
});

describe('isFullStackProvider', () => {
  it('returns true for providers with all four standard capabilities', async () => {
    const { isFullStackProvider } = await import('@/src/lib/ai/capabilities');
    expect(isFullStackProvider('openai')).toBe(true);
    expect(isFullStackProvider('google')).toBe(true);
    expect(isFullStackProvider('qwen')).toBe(true);
    expect(isFullStackProvider('openrouter')).toBe(true);
  });

  it('returns false for text-only providers', async () => {
    const { isFullStackProvider } = await import('@/src/lib/ai/capabilities');
    expect(isFullStackProvider('anthropic')).toBe(false);
    expect(isFullStackProvider('deepseek')).toBe(false);
  });

  it('returns false for unknown providers', async () => {
    const { isFullStackProvider } = await import('@/src/lib/ai/capabilities');
    expect(isFullStackProvider('nonexistent')).toBe(false);
    expect(isFullStackProvider('')).toBe(false);
  });
});
