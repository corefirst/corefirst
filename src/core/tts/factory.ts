import { resolveFeature } from '@/src/lib/ai';
import { buildSpeechModelWith } from '@/src/lib/ai/text-to-speech/factory';
import { PROVIDER_DEFAULTS } from '@/src/lib/ai/capabilities';
import { getProviderTTSVoice } from '@/src/lib/ai/dynamic-config';
import type { TTSOverride } from '@/src/lib/ai/settings-config';
import type { TTSProvider } from './interface';
import { OpenAITTSProvider } from './openai-provider';
import { GoogleGeminiTTSProvider } from './google-provider';
import { QwenTTSProvider } from './qwen-provider';

type TTSCreator = (r: { model: string, apiKey?: string, voice?: string }) => TTSProvider;

const registry = new Map<string, TTSCreator>();

/** Register a TTSProvider factory for a provider id. */
export function registerTTSProvider(provider: string, creator: TTSCreator): void {
  registry.set(provider, creator);
}

// ── Built-in providers ────────────────────────────────────────────────────────
registerTTSProvider('openai',     (r) => new OpenAITTSProvider(undefined, r.voice));
registerTTSProvider('qwen',       (r) => new QwenTTSProvider(r.apiKey || process.env.QWEN_API_KEY || '', r.model, r.voice));
registerTTSProvider('openrouter', (r) => new OpenAITTSProvider(undefined, r.voice));
registerTTSProvider('google',     () => new GoogleGeminiTTSProvider());

export class TTSFactory {
  static getProvider(override?: TTSOverride): TTSProvider {
    if (override) {
      if (override.provider === 'google') {
        const model = override.model || PROVIDER_DEFAULTS['google']?.['text-to-speech'] || '';
        console.log(`[ai/tts] provider=google model=${model}`);
        return new GoogleGeminiTTSProvider({ model, apiKey: override.apiKey, voice: override.voice });
      }
      if (override.provider === 'qwen') {
        const model = override.model || PROVIDER_DEFAULTS['qwen']?.['text-to-speech'] || 'qwen3-tts-flash';
        const voice = override.voice || getProviderTTSVoice('qwen');
        console.log(`[ai/tts] provider=qwen model=${model} (native API)`);
        return new QwenTTSProvider(override.apiKey || process.env.QWEN_API_KEY || '', model, voice);
      }
      console.log(`[ai/tts] provider=${override.provider ?? 'override'} model=${override.model || '(default)'}`);
      const model = buildSpeechModelWith({ baseUrl: override.baseUrl, model: override.model, apiKey: override.apiKey });
      return new OpenAITTSProvider(model, override.voice);
    }
    const r = resolveFeature('tts');
    if (r.provider === 'none') return new NullTTSProvider(r.envPrefix);
    console.log(`[ai/tts] provider=${r.provider} model=${r.model}`);
    const creator = registry.get(r.provider);
    if (!creator) throw new Error(`[ai/tts] Unregistered TTS provider "${r.provider}". This is a bug.`);
    return creator({ model: r.model, apiKey: r.apiKey, voice: getProviderTTSVoice(r.provider) });
  }
}

class NullTTSProvider implements TTSProvider {
  constructor(private envPrefix: string) {}
  async generateAudio(_text: string): Promise<Uint8Array> {
    throw new Error(`Text-to-speech is disabled. Set ${this.envPrefix}_PROVIDER to enable.`);
  }
}
