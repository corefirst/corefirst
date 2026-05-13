import type { ImageModel } from 'ai';
import { resolveFeature, type ResolvedFeature } from '../config';
import { InvalidProviderError } from '../capabilities';
import { PROVIDER_BASE_URLS } from '../provider-urls';
import { googleImagenModel } from './sdk/google-imagen';
import { openaiImageModel } from './sdk/openai-image';

type ImageModelBuilder = (r: ResolvedFeature, apiKeyOverride?: string) => ImageModel;

const registry = new Map<string, ImageModelBuilder>();

/** Register an image-model builder for a provider id. */
export function registerImageModelBuilder(provider: string, builder: ImageModelBuilder): void {
  registry.set(provider, builder);
}

// ── Built-in providers ────────────────────────────────────────────────────────
registerImageModelBuilder('google',     (r, k) => googleImagenModel(r.model, k ?? r.apiKey));
registerImageModelBuilder('openai',     (r, k) => openaiImageModel(r.model, r.baseUrl, k ?? r.apiKey));
registerImageModelBuilder('qwen',       (r, k) => openaiImageModel(r.model, PROVIDER_BASE_URLS.qwen, k ?? r.apiKey));
registerImageModelBuilder('openrouter', (r, k) => openaiImageModel(r.model, PROVIDER_BASE_URLS.openrouter, k ?? r.apiKey));

export function buildImageModel(): ImageModel {
  const r = resolveFeature('imageGen');
  if (r.provider === 'none') {
    return new Proxy({}, {
      get() {
        throw new Error(
          `[ai/imageGen] Image generation is disabled. Set ${r.envPrefix}_PROVIDER to enable.`
        );
      },
    }) as ImageModel;
  }
  const builder = registry.get(r.provider);
  if (!builder) throw new InvalidProviderError(r.provider, 'text-to-image');
  return builder(r);
}

export function buildImageModelWith(overrides: { provider?: string; apiKey?: string }): ImageModel {
  const r = resolveFeature('imageGen');
  const provider = overrides.provider || r.provider;
  if (provider === 'none') return buildImageModel();
  const builder = registry.get(provider);
  if (!builder) throw new InvalidProviderError(provider, 'text-to-image');
  return builder(r, overrides.apiKey);
}
