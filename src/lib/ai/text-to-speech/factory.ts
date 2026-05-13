import type { SpeechModel } from 'ai';
import { resolveFeature, type ResolvedFeature } from '../config';
import { InvalidProviderError } from '../capabilities';
import { PROVIDER_BASE_URLS } from '../provider-urls';
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
registerSpeechModelBuilder('google',     (_r) => nonAiSdkStub('tts'));
registerSpeechModelBuilder('qwen',       (r) => openaiTtsModel(r.model, PROVIDER_BASE_URLS.qwen, r.apiKey));
registerSpeechModelBuilder('openrouter', (r) => openaiTtsModel(r.model, PROVIDER_BASE_URLS.openrouter, r.apiKey));

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
