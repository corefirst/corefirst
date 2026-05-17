import { resolveFeature } from '@/src/lib/ai';
import { buildTranscriptionModelWith } from '@/src/lib/ai/speech-to-text/factory';
import type { STTOverride } from '@/src/lib/ai/settings-config';
import type { STTProvider, STTOptions } from './interface';
import { OpenAISTTProvider } from './openai-provider';
import { GoogleGeminiSTTProvider } from './google-provider';
import { QwenSTTProvider } from './qwen-provider';
import { OpenRouterSTTProvider } from './openrouter-provider';
import { PROVIDER_DEFAULTS } from '@/src/lib/ai/capabilities';
import { getProviderBaseUrl } from '@/src/lib/ai/dynamic-config';

type STTCreator = () => STTProvider;

const registry = new Map<string, STTCreator>();

/** Register a STTProvider factory for a provider id. */
export function registerSTTProvider(provider: string, creator: STTCreator): void {
  registry.set(provider, creator);
}

// ── Built-in providers ────────────────────────────────────────────────────────
registerSTTProvider('openai',     () => new OpenAISTTProvider());
// NOTE: OpenRouter's /v1/audio/transcriptions uses a JSON+base64 schema,
// not OpenAI's multipart form — see OpenRouterSTTProvider for the workaround.
registerSTTProvider('openrouter', () => {
  const r = resolveFeature('stt');
  return new OpenRouterSTTProvider(r.model, r.apiKey || '', r.baseUrl);
});
registerSTTProvider('google',     () => new GoogleGeminiSTTProvider());
// Qwen uses DashScope's native ASR API (not OpenAI-compat /audio/transcriptions)
registerSTTProvider('qwen',       () => {
  const r = resolveFeature('stt');
  return new QwenSTTProvider(r.apiKey || process.env.QWEN_API_KEY || '', r.model);
});

export class STTFactory {
  static getProvider(override?: STTOverride): STTProvider {
    if (override) {
      if (override.provider === 'qwen' && override.apiKey) {
        const model = override.model || PROVIDER_DEFAULTS['qwen']?.['speech-to-text'] || 'sensevoice-v1';
        console.log(`[ai/stt] provider=qwen model=${model} (DashScope native API)`);
        return new QwenSTTProvider(override.apiKey, model);
      }
      if (override.provider === 'google') {
        const model = override.model || PROVIDER_DEFAULTS['google']?.['speech-to-text'];
        console.log(`[ai/stt] provider=google model=${model}`);
        return new GoogleGeminiSTTProvider({ model, apiKey: override.apiKey });
      }
      if (override.provider === 'openrouter') {
        const model = override.model || PROVIDER_DEFAULTS['openrouter']?.['speech-to-text'] || 'openai/gpt-4o-mini-transcribe';
        const baseUrl = override.baseUrl || getProviderBaseUrl('openrouter') || 'https://openrouter.ai/api/v1';
        console.log(`[ai/stt] provider=openrouter baseUrl=${baseUrl} model=${model} (json+base64 schema)`);
        return new OpenRouterSTTProvider(model, override.apiKey || '', baseUrl);
      }
      console.log(`[ai/stt] provider=${override.provider ?? 'override'} baseUrl=${override.baseUrl} model=${override.model ?? '(default)'}`);
      const model = buildTranscriptionModelWith({ baseUrl: override.baseUrl, apiKey: override.apiKey, model: override.model });
      return new OpenAISTTProvider(model);
    }
    const r = resolveFeature('stt');
    if (r.provider === 'none') return new NullSTTProvider(r.envPrefix);
    console.log(`[ai/stt] provider=${r.provider} model=${r.model}`);
    const creator = registry.get(r.provider);
    if (!creator) throw new Error(`[ai/stt] Unregistered STT provider "${r.provider}". This is a bug.`);
    return creator();
  }
}

class NullSTTProvider implements STTProvider {
  constructor(private envPrefix: string) {}
  async transcribe(_audio: Uint8Array, _opts?: STTOptions): Promise<{ text: string }> {
    throw new Error(`Speech-to-text is disabled. Set ${this.envPrefix}_PROVIDER to enable.`);
  }
}
