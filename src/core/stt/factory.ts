import { resolveFeature } from '@/src/lib/ai';
import { buildTranscriptionModelWith } from '@/src/lib/ai/speech-to-text/factory';
import type { STTOverride } from '@/src/lib/ai/settings-config';
import type { STTProvider, STTOptions } from './interface';
import { OpenAISTTProvider } from './openai-provider';
import { GoogleGeminiSTTProvider } from './google-provider';

type STTCreator = () => STTProvider;

const registry = new Map<string, STTCreator>();

/** Register a STTProvider factory for a provider id. */
export function registerSTTProvider(provider: string, creator: STTCreator): void {
  registry.set(provider, creator);
}

// ── Built-in providers ────────────────────────────────────────────────────────
// qwen (DashScope SenseVoice/Paraformer) and openrouter both use the OpenAI-compat STT path.
registerSTTProvider('openai',     () => new OpenAISTTProvider());
registerSTTProvider('qwen',       () => new OpenAISTTProvider());
registerSTTProvider('openrouter', () => new OpenAISTTProvider());
registerSTTProvider('google',     () => new GoogleGeminiSTTProvider());

export class STTFactory {
  static getProvider(override?: STTOverride): STTProvider {
    if (override) {
      console.log(`[ai/stt] provider=${override.provider ?? 'override'} baseUrl=${override.baseUrl}`);
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
