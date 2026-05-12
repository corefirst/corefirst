import { resolveFeature } from '@/src/lib/ai';
import { buildImageModelWith } from '@/src/lib/ai/text-to-image/factory';
import type { ImageOverride } from '@/src/lib/ai/settings-config';
import { VisualProvider } from './interface';
import { ImagenProvider } from './imagen-provider';

export class VisualFactory {
  static getProvider(override?: ImageOverride): VisualProvider {
    if (override) {
      const model = buildImageModelWith({ provider: override.provider, apiKey: override.apiKey });
      return new ImagenProvider(model);
    }
    const r = resolveFeature('imageGen');
    if (r.provider === 'none') return new NullVisualProvider(r.envPrefix);
    return new ImagenProvider();
  }
}

class NullVisualProvider implements VisualProvider {
  constructor(private envPrefix: string) {}
  async generateImage(_prompt: string): Promise<string> {
    throw new Error(`Image generation is disabled. Set ${this.envPrefix}_PROVIDER to enable.`);
  }
}
