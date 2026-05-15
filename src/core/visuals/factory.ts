import { resolveFeature } from '@/src/lib/ai';
import { buildImageModelWith } from '@/src/lib/ai/text-to-image/factory';
import type { ImageOverride } from '@/src/lib/ai/settings-config';
import { VisualProvider } from './interface';
import { AISDKImageProvider } from './imagen-provider';
import { QwenVisualProvider } from './qwen-provider';
import { OllamaImageProvider } from './ollama-provider';

export class VisualFactory {
  static getProvider(override?: ImageOverride): VisualProvider {
    const r = resolveFeature('imageGen');

    if (override) {
      const effectiveApiKey = override.apiKey || r.apiKey;
      // If an override is present, it must be fully self-contained. 
      // Do NOT leak r.baseUrl into the override path.
      const effectiveBaseUrl = override.baseUrl ?? undefined;
      
      if (override.provider === 'qwen') {
        return new QwenVisualProvider(effectiveApiKey, override.model);
      }
      if (override.provider === 'ollama') {
        const raw = (effectiveBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
        const baseURL = /\/v1$/.test(raw) ? raw : `${raw}/v1`;
        return new OllamaImageProvider(baseURL, override.model || r.model, effectiveApiKey);
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
      return new QwenVisualProvider(r.apiKey, r.model);
    }

    if (r.provider === 'ollama') {
      const raw = (r.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
      const baseURL = /\/v1$/.test(raw) ? raw : `${raw}/v1`;
      return new OllamaImageProvider(baseURL, r.model, r.apiKey);
    }

    // All other supported image providers (google, openai, openrouter) go through
    // the AI-SDK ImageModel path.
    return new AISDKImageProvider();
  }
}

class NullVisualProvider implements VisualProvider {
  constructor(private envPrefix: string) {}
  async generateImage(_prompt: string): Promise<string> {
    throw new Error(`Image generation is disabled. Set ${this.envPrefix}_PROVIDER to enable.`);
  }
}
