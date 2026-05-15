import type { ImageModel } from 'ai';
import { resolveFeature, type ResolvedFeature } from '../config';
import { InvalidProviderError } from '../capabilities';
import { getProviderBaseUrl, getProviderDefault } from '../dynamic-config';
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
registerImageModelBuilder('ollama',     (r, _k) => {
  // Ollama's experimental image generation returns NDJSON which AI-SDK 
  // doesn't handle well. It is served by OllamaImageProvider in 
  // src/core/visuals — register a stub here.
  return new Proxy({}, {
    get() {
      throw new Error(
        '[ai/imageGen] Ollama image generation is served outside the AI-SDK path; ' +
        'use VisualFactory.getProvider() instead.'
      );
    },
  }) as ImageModel;
});
registerImageModelBuilder('qwen',       (r, k) => openaiImageModel(r.model, getProviderBaseUrl('qwen'), k ?? r.apiKey));
registerImageModelBuilder('openrouter', (r, k) => openaiImageModel(r.model, getProviderBaseUrl('openrouter'), k ?? r.apiKey));

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
  console.log(`[ai/imageGen] provider=${r.provider} model=${r.model} baseUrl=${r.baseUrl ?? '(default)'}`);
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
    getProviderDefault(provider, 'text-to-image') ||
    r.model;
  const effectiveR = {
    ...r,
    model: resolvedModel,
    baseUrl: overrides.baseUrl || r.baseUrl,
  };
  console.log(`[ai/imageGen] request: provider=${provider} model=${effectiveR.model} baseUrl=${effectiveR.baseUrl ?? '(default)'}`);
  return builder(effectiveR, overrides.apiKey);
}
