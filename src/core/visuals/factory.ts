import { resolveFeature } from '@/src/lib/ai';
import { VisualProvider } from './interface';
import { ImagenProvider } from './imagen-provider';

export class VisualFactory {
  static getProvider(): VisualProvider {
    const r = resolveFeature('imageGen');
    if (r.provider === 'none') {
      return new NullVisualProvider(r.envPrefix);
    }
    // Currently only Google Imagen (imagen-4.0).
    // To add another provider (e.g. an OpenAI-image fallback), branch here on env.
    return new ImagenProvider();
  }
}

class NullVisualProvider implements VisualProvider {
  constructor(private envPrefix: string) {}
  async generateImage(_prompt: string): Promise<string> {
    throw new Error(`Image generation is disabled. Set ${this.envPrefix}_PROVIDER to enable.`);
  }
}
