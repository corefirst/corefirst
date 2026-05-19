import type { SpeechModel } from 'ai';
import { resolveFeature, type ResolvedFeature } from '../config';
import { InvalidProviderError } from '../capabilities';
import { getProviderBaseUrl } from '../dynamic-config';
import { openaiTtsModel } from './sdk/openai-tts';

type SpeechModelBuilder = (r: ResolvedFeature) => SpeechModel;

const registry = new Map<string, SpeechModelBuilder>();

/** Register a speech-model builder for a provider id. */
export function registerSpeechModelBuilder(provider: string, builder: SpeechModelBuilder): void {
  registry.set(provider, builder);
}

// ── Built-in providers ────────────────────────────────────────────────────────
// Google Gemini TTS bypasses the AI-SDK SpeechModel interface (no SDK support yet).
// It is served by GoogleGeminiTTSProvider in src/core/tts — register a stub so the
// module-level `ttsModel` singleton remains a valid value; callers must route through
// TTSFactory.getProvider() for the google branch.
registerSpeechModelBuilder('openai',     (r) => openaiTtsModel(r.model, r.baseUrl, r.apiKey));
registerSpeechModelBuilder('ollama',     (r) => {
  // If the user hasn't provided a base URL, default to the one from OLLAMA_BASE_URL
  // or the standard local port. For TTS, we assume an OpenAI-compatible server 
  // like kokoro or faster-whisper-server is used, which usually follows the /v1 path.
  const raw = (r.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  const baseURL = /\/v1$/.test(raw) ? raw : `${raw}/v1`;
  return openaiTtsModel(r.model, baseURL, r.apiKey);
});
registerSpeechModelBuilder('google',     (_r) => nonAiSdkStub('tts'));
registerSpeechModelBuilder('qwen',       (r) => openaiTtsModel(r.model, getProviderBaseUrl('qwen'), r.apiKey));
registerSpeechModelBuilder('openrouter', (r) => openaiTtsModel(r.model, getProviderBaseUrl('openrouter'), r.apiKey));
registerSpeechModelBuilder('corefirst',  (r) => {
  if (!r.baseUrl) throw new Error('[ai/tts/corefirst] missing baseUrl');
  if (!r.apiKey)  throw new Error('[ai/tts/corefirst] missing cloud access token');
  return openaiTtsModel(r.model, r.baseUrl, r.apiKey);
});

export function buildSpeechModel(): SpeechModel {
  const r = resolveFeature('tts');
  if (r.provider === 'none') {
    return new Proxy({}, {
      get() {
        throw new Error(
          `[ai/tts] Text-to-speech is disabled. Set ${r.envPrefix}_PROVIDER to enable.`
        );
      },
    }) as SpeechModel;
  }
  const builder = registry.get(r.provider);
  if (!builder) throw new InvalidProviderError(r.provider, 'text-to-speech');
  return builder(r);
}

export function buildSpeechModelWith(overrides: { baseUrl?: string; model?: string; apiKey?: string }): SpeechModel {
  const r = resolveFeature('tts');
  return openaiTtsModel(overrides.model || r.model, overrides.baseUrl || r.baseUrl, overrides.apiKey ?? r.apiKey);
}

function nonAiSdkStub(kind: 'tts' | 'stt'): SpeechModel {
  return new Proxy({}, {
    get() {
      throw new Error(
        `[ai/${kind}] This provider is served outside the AI-SDK path; use ` +
        `${kind === 'tts' ? 'TTSFactory.getProvider()' : 'STTFactory.getProvider()'} instead.`,
      );
    },
  }) as SpeechModel;
}
