import type { ImageModel } from 'ai';
import { resolveFeature, type ResolvedFeature } from '../config';
import { InvalidProviderError, PROVIDER_DEFAULTS } from '../capabilities';
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
  console.log(`[ai/imageGen] provider=${r.provider} model=${r.model}`);
  const builder = registry.get(r.provider);
  if (!builder) throw new InvalidProviderError(r.provider, 'text-to-image');
  return builder(r);
}

export function buildImageModelWith(overrides: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }): ImageModel {
  const r = resolveFeature('imageGen');
  const provider = overrides.provider || r.provider;
  if (provider === 'none') return buildImageModel();
  const builder = registry.get(provider);
  if (!builder) throw new InvalidProviderError(provider, 'text-to-image');
  // When the caller supplies a provider override but no model, fall back to
  // that provider's default for the text-to-image capability rather than
  // using r.model (which was resolved for a potentially different provider
  // from env vars and would be empty or wrong).
  const resolvedModel =
    overrides.model ||
    PROVIDER_DEFAULTS[provider]?.['text-to-image'] ||
    r.model;
  const effectiveR = {
    ...r,
    model: resolvedModel,
    ...(overrides.baseUrl ? { baseUrl: overrides.baseUrl } : {}),
  };
  console.log(`[ai/imageGen] request: provider=${provider} model=${effectiveR.model}`);
  return builder(effectiveR, overrides.apiKey);
}
