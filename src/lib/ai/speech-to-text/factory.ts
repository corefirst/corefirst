import type { TranscriptionModel } from 'ai';
import { resolveFeature, type ResolvedFeature } from '../config';
import { InvalidProviderError } from '../capabilities';
import { getProviderBaseUrl } from '../dynamic-config';
import { openaiSttModel } from './sdk/openai-stt';

type TranscriptionModelBuilder = (r: ResolvedFeature) => TranscriptionModel;

const registry = new Map<string, TranscriptionModelBuilder>();

/** Register a transcription-model builder for a provider id. */
export function registerTranscriptionModelBuilder(
  provider: string,
  builder: TranscriptionModelBuilder,
): void {
  registry.set(provider, builder);
}

// ── Built-in providers ────────────────────────────────────────────────────────
// Google Gemini STT bypasses the AI-SDK TranscriptionModel interface.
// It is served by GoogleGeminiSTTProvider in src/core/stt — stub keeps the
// module-level `sttModel` singleton valid; callers must use STTFactory.getProvider().
registerTranscriptionModelBuilder('openai',     (r) => openaiSttModel(r.model, r.baseUrl, r.apiKey));
registerTranscriptionModelBuilder('ollama',     (r) => {
  // Normalize base URL for Ollama's OpenAI-compatible endpoint.
  const raw = (r.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  const baseURL = /\/v1$/.test(raw) ? raw : `${raw}/v1`;
  return openaiSttModel(r.model, baseURL, r.apiKey);
});
registerTranscriptionModelBuilder('google',     (_r) => nonAiSdkStub());
registerTranscriptionModelBuilder('qwen',       (r) => openaiSttModel(r.model, getProviderBaseUrl('qwen'), r.apiKey));
registerTranscriptionModelBuilder('openrouter', (r) => openaiSttModel(r.model, getProviderBaseUrl('openrouter'), r.apiKey));

export function buildTranscriptionModel(): TranscriptionModel {
  const r = resolveFeature('stt');
  if (r.provider === 'none') {
    return new Proxy({}, {
      get() {
        throw new Error(
          `[ai/stt] Speech-to-text is disabled. Set ${r.envPrefix}_PROVIDER to enable.`
        );
      },
    }) as TranscriptionModel;
  }
  const builder = registry.get(r.provider);
  if (!builder) throw new InvalidProviderError(r.provider, 'speech-to-text');
  return builder(r);
}

export function buildTranscriptionModelWith(overrides: { baseUrl?: string; apiKey?: string; model?: string }): TranscriptionModel {
  const r = resolveFeature('stt');
  return openaiSttModel(overrides.model || r.model, overrides.baseUrl || r.baseUrl, overrides.apiKey ?? r.apiKey);
}

function nonAiSdkStub(): TranscriptionModel {
  return new Proxy({}, {
    get() {
      throw new Error(
        '[ai/stt] Google STT is served outside the AI-SDK path; use STTFactory.getProvider() instead.',
      );
    },
  }) as TranscriptionModel;
}
