import type { SpeechModel } from 'ai';
import { resolveFeature } from '../config';
import { openaiTtsModel } from './sdk/openai-tts';

export function buildSpeechModel(): SpeechModel {
  const r = resolveFeature('tts');
  if (r.provider === 'none') {
    return new Proxy({}, {
      get() {
        throw new Error(
          `[ai/tts] Text-to-speech is disabled by default. Set ${r.envPrefix}_PROVIDER to enable.`
        );
      },
    }) as SpeechModel;
  }

  switch (r.provider) {
    case 'openai':
      // Local OpenAI-compatible TTS servers (Kokoro-FastAPI, Orpheus-FastAPI,
      // Piper, Coqui XTTS, etc.) plug in here via TTS_BASE_URL.
      return openaiTtsModel(r.model, r.baseUrl, r.apiKey);
    default:
      throw new Error(`[ai/text-to-speech] Unhandled provider "${r.provider}". This is a bug.`);
  }
}

export function buildSpeechModelWith(overrides: { baseUrl?: string; model?: string }): SpeechModel {
  const r = resolveFeature('tts');
  return openaiTtsModel(overrides.model || r.model, overrides.baseUrl || r.baseUrl, r.apiKey);
}
