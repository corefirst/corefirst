import { resolveFeature } from '@/src/lib/ai';
import { buildImageModelWith } from '@/src/lib/ai/text-to-image/factory';
import type { ImageOverride } from '@/src/lib/ai/settings-config';
import { VisualProvider } from './interface';
import { AISDKImageProvider } from './imagen-provider';

export class VisualFactory {
  static getProvider(override?: ImageOverride): VisualProvider {
    if (override) {
      const model = buildImageModelWith({ provider: override.provider, apiKey: override.apiKey });
      return new AISDKImageProvider(model);
    }
    const r = resolveFeature('imageGen');
    if (r.provider === 'none') return new NullVisualProvider(r.envPrefix);
    // All supported image providers (google, openai, qwen, openrouter) go through
    // the AI-SDK ImageModel path — no per-provider branching needed here.
    return new AISDKImageProvider();
  }
}

class NullVisualProvider implements VisualProvider {
  constructor(private envPrefix: string) {}
  async generateImage(_prompt: string): Promise<string> {
    throw new Error(`Image generation is disabled. Set ${this.envPrefix}_PROVIDER to enable.`);
  }
}
