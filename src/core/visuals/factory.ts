import { resolveFeature } from '@/src/lib/ai';
import { buildImageModelWith } from '@/src/lib/ai/text-to-image/factory';
import type { ImageOverride } from '@/src/lib/ai/settings-config';
import { VisualProvider } from './interface';
import { AISDKImageProvider } from './imagen-provider';
import { QwenVisualProvider } from './qwen-provider';
import { OllamaImageProvider } from './ollama-provider';
import { OpenRouterImageProvider } from './openrouter-provider';
import { getProviderBaseUrl } from '@/src/lib/ai/dynamic-config';
import { PROVIDER_DEFAULTS } from '@/src/lib/ai/capabilities';

export class VisualFactory {
  static getProvider(override?: ImageOverride): VisualProvider {
    const r = resolveFeature('imageGen');

    if (override) {
      const effectiveApiKey = override.apiKey || r.apiKey;
      // If an override is present, it must be fully self-contained. 
      // Do NOT leak r.baseUrl into the override path.
      const effectiveBaseUrl = override.baseUrl ?? undefined;
      
      if (override.provider === 'qwen') {
        return new QwenVisualProvider(effectiveApiKey ?? '', override.model);
      }
      if (override.provider === 'ollama') {
        const raw = (effectiveBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
        const baseURL = /\/v1$/.test(raw) ? raw : `${raw}/v1`;
        return new OllamaImageProvider(baseURL, override.model || r.model, effectiveApiKey);
      }
      if (override.provider === 'openrouter') {
        const model = override.model || PROVIDER_DEFAULTS['openrouter']?.['text-to-image'] || 'google/gemini-3.1-flash-image-preview';
        const baseUrl = effectiveBaseUrl || getProviderBaseUrl('openrouter') || 'https://openrouter.ai/api/v1';
        console.log(`[ai/imageGen] provider=openrouter baseUrl=${baseUrl} model=${model} (chat/completions+modalities)`);
        return new OpenRouterImageProvider(model, effectiveApiKey || '', baseUrl);
      }
      const model = buildImageModelWith({
        provider: override.provider,
        apiKey: effectiveApiKey,
        model: override.model,
        baseUrl: effectiveBaseUrl
      });
      return new AISDKImageProvider(model);
    }

    if (r.provider === 'none') return new NullVisualProvider(r.envPrefix);
    
    if (r.provider === 'qwen') {
      return new QwenVisualProvider(r.apiKey ?? '', r.model);
    }

    if (r.provider === 'ollama') {
      const raw = (r.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
      const baseURL = /\/v1$/.test(raw) ? raw : `${raw}/v1`;
      return new OllamaImageProvider(baseURL, r.model, r.apiKey);
    }

    if (r.provider === 'openrouter') {
      return new OpenRouterImageProvider(
        r.model,
        r.apiKey || '',
        r.baseUrl || getProviderBaseUrl('openrouter') || 'https://openrouter.ai/api/v1',
      );
    }

    // Remaining supported image providers (google, openai) go through the
    // AI-SDK ImageModel path.
    return new AISDKImageProvider();
  }
}

class NullVisualProvider implements VisualProvider {
  constructor(private envPrefix: string) {}
  async generateImage(_prompt: string): Promise<string> {
    throw new Error(`Image generation is disabled. Set ${this.envPrefix}_PROVIDER to enable.`);
  }
}
