import { resolveFeature } from '@/src/lib/ai';
import { TTSProvider } from './interface';
import { OpenAITTSProvider } from './openai-provider';

/**
 * TTS provider factory.
 *
 * Currently exposes only the OpenAI provider (via the Vercel AI SDK
 * `generateSpeech` API). Google Gemini TTS models exist (`gemini-2.5-*-tts`)
 * but `@ai-sdk/google` doesn't yet ship a `.speech()` constructor, so the
 * Google branch is deferred. To add it back: implement a `GoogleTTSProvider`
 * once `@ai-sdk/google` (or `@ai-sdk/google-vertex`) exposes a SpeechModelV3.
 */
export class TTSFactory {
  static getProvider(): TTSProvider {
    const r = resolveFeature('tts');
    if (r.provider === 'none') {
      return new NullTTSProvider(r.envPrefix);
    }
    return new OpenAITTSProvider();
  }
}

class NullTTSProvider implements TTSProvider {
  constructor(private envPrefix: string) {}
  async generateAudio(_text: string): Promise<Uint8Array> {
    throw new Error(`Text-to-speech is disabled. Set ${this.envPrefix}_PROVIDER to enable.`);
  }
}
