import type { TranscriptionModel } from 'ai';
import { resolveFeature } from '../config';
import { openaiSttModel } from './sdk/openai-stt';

export function buildTranscriptionModel(): TranscriptionModel {
  const r = resolveFeature('stt');
  if (r.provider === 'none') {
    return new Proxy({} as TranscriptionModel, {
      get() {
        throw new Error(
          `[ai/stt] Speech-to-text is disabled by default. Set ${r.envPrefix}_PROVIDER to enable.`
        );
      },
    });
  }

  switch (r.provider) {
    case 'openai':
      // Local OpenAI-compatible STT servers (faster-whisper-server,
      // whisper.cpp HTTP, Voxtral, etc.) plug in here via STT_BASE_URL.
      return openaiSttModel(r.model, r.baseUrl, r.apiKey);
    default:
      throw new Error(`[ai/speech-to-text] Unhandled provider "${r.provider}". This is a bug.`);
  }
}
