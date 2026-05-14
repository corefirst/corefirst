/**
 * Per-request AI settings extraction and model resolution.
 *
 * SECURITY NOTE: `baseUrl` values (x-cf-ollama-url, x-cf-tts-url, x-cf-stt-url) are
 * accepted from client request headers and used to construct AI provider clients. This
 * is safe for self-hosted deployments where the operator controls the client, but in a
 * shared/SaaS context it allows users to point these endpoints at arbitrary servers.
 * Enforce HTTPS at the reverse-proxy layer; add an allowlist if multi-tenant use is planned.
 */
import type { LanguageModel } from 'ai';
import type { FeatureKey } from './capabilities';
import { getDefaultTextModel } from './capabilities';
import { buildTextModelFromSpec } from './text/factory';
import {
  getProviderDefault,
  getProviderBaseUrl,
  getProviderTTSVoice,
} from './dynamic-config';

/** Per-feature text override from request headers (x-cf-{feature}-provider etc.). */
export type FeatureTextOverride = { provider: string; model: string };

export interface RequestSettings {
  global:   { provider: string; apiKey: string; model: string };
  text:     { provider: string; model: string; apiKey: string };
  ollama:   { baseUrl: string };
  tts:      { provider: string; baseUrl: string; model: string; apiKey: string };
  stt:      { provider: string; baseUrl: string; apiKey: string; model: string };
  image:    { provider: string; apiKey: string; model: string; baseUrl: string };
  /** Per-feature text overrides. Take precedence over the global text settings.
   *  Headers: x-cf-{feature}-provider, x-cf-{feature}-model
   *  (e.g. x-cf-transform-provider=anthropic, x-cf-roleplay-model=claude-haiku-4-5) */
  features: Partial<Record<FeatureKey, FeatureTextOverride>>;
}

/**
 * Per-request overrides for TTS/STT/image providers.
 *
 * TTS and STT overrides represent a custom OpenAI-compatible endpoint supplied
 * by the client (x-cf-tts-url / x-cf-stt-url). The `provider` field is carried
 * along for completeness but the factory always uses the OpenAI-compat path for
 * overrides — provider switching must be done via env vars (TTS_PROVIDER etc.).
 */
export interface TTSOverride  { provider?: string; baseUrl?: string; model: string; apiKey?: string; voice?: string }
export interface STTOverride  { provider?: string; baseUrl?: string; apiKey?: string; model?: string }
export interface ImageOverride { provider: string; apiKey: string; model?: string; baseUrl?: string }


// Maps FeatureKey to the header prefix used for per-feature overrides.
// Convention: x-cf-{prefix}-provider / x-cf-{prefix}-model
const FEATURE_HEADER: Partial<Record<FeatureKey, string>> = {
  transform:  'transform',
  roleplay:   'roleplay',
  courseGen:  'course-gen',
  speechEval: 'speech-eval',
};

function getHeader(request: Request, name: string): string {
  return request.headers.get(name)?.trim() ?? '';
}

function readFeatureOverride(request: Request, prefix: string): FeatureTextOverride {
  return {
    provider: getHeader(request, `x-cf-${prefix}-provider`),
    model:    getHeader(request, `x-cf-${prefix}-model`),
  };
}

export function extractSettings(request: Request): RequestSettings {
  const features: Partial<Record<FeatureKey, FeatureTextOverride>> = {};
  for (const [key, prefix] of Object.entries(FEATURE_HEADER) as [FeatureKey, string][]) {
    const override = readFeatureOverride(request, prefix);
    if (override.provider) features[key] = override;
  }

  return {
    global: {
      provider: getHeader(request, 'x-cf-provider'),
      apiKey:   getHeader(request, 'x-cf-api-key'),
      model:    getHeader(request, 'x-cf-model'),
    },
    text: {
      provider: getHeader(request, 'x-cf-text-provider'),
      model:    getHeader(request, 'x-cf-text-model'),
      apiKey:   getHeader(request, 'x-cf-text-key'),
    },
    ollama: { baseUrl: getHeader(request, 'x-cf-ollama-url') },
    tts: {
      provider: getHeader(request, 'x-cf-tts-provider'),
      baseUrl:  getHeader(request, 'x-cf-tts-url'),
      model:    getHeader(request, 'x-cf-tts-model'),
      apiKey:   getHeader(request, 'x-cf-tts-key'),
    },
    stt: {
      provider: getHeader(request, 'x-cf-stt-provider'),
      baseUrl:  getHeader(request, 'x-cf-stt-url'),
      apiKey:   getHeader(request, 'x-cf-stt-key'),
      model:    getHeader(request, 'x-cf-stt-model'),
    },
    image: {
      provider: getHeader(request, 'x-cf-image-provider'),
      apiKey:   getHeader(request, 'x-cf-image-key'),
      model:    getHeader(request, 'x-cf-image-model'),
      baseUrl:  getHeader(request, 'x-cf-image-url'),
    },
    features,
  };
}

function hasTextSettings(s: RequestSettings): boolean {
  return !!(s.global.provider || s.text.provider);
}

export function resolveTextModel(settings: RequestSettings): LanguageModel | undefined {
  if (!hasTextSettings(settings)) return undefined;

  const provider = settings.text.provider || settings.global.provider;
  if (!provider) return undefined;

  const apiKey  = settings.text.apiKey  || settings.global.apiKey  || undefined;
  const baseUrl = provider === 'ollama' ? (settings.ollama.baseUrl || undefined) : undefined;
  const model   = settings.text.model   || settings.global.model   || getDefaultTextModel(provider);

  console.log(`[ai/text] request: provider=${provider} model=${model}`);
  return buildTextModelFromSpec({ provider, model, apiKey, baseUrl });
}

/**
 * Resolve the LLM for a specific feature.
 *
 * Resolution order (most → least specific):
 *   1. Per-feature header  x-cf-{feature}-provider  (e.g. x-cf-roleplay-provider=ollama)
 *   2. Global text header  x-cf-text-provider / x-cf-provider
 *   3. Server env vars     ROLEPLAY_PROVIDER / TEXT_PROVIDER / GLOBAL_PROVIDER
 *   4. Feature default     FEATURES[feature].defaultProvider
 *
 * Steps 3-4 are handled server-side by resolveFeature() at startup; this
 * function covers the client-header path (steps 1-2).
 */
export function resolveFeatureFromSettings(
  feature: FeatureKey,
  settings: RequestSettings,
): LanguageModel | undefined {
  const featureOverride = settings.features[feature];
  if (featureOverride?.provider) {
    const apiKey  = settings.text.apiKey || settings.global.apiKey || undefined;
    const baseUrl = featureOverride.provider === 'ollama'
      ? (settings.ollama.baseUrl || undefined)
      : undefined;
    const model = featureOverride.model || getDefaultTextModel(featureOverride.provider);
    return buildTextModelFromSpec({ provider: featureOverride.provider, model, apiKey, baseUrl });
  }
  return resolveTextModel(settings);
}

export function resolveTTSOverride(settings: RequestSettings): TTSOverride | undefined {
  const { tts, global: g } = settings;
  const apiKey = tts.apiKey || g.apiKey || undefined;
  if (tts.baseUrl) {
    return { provider: tts.provider || 'openai', baseUrl: tts.baseUrl, model: tts.model, apiKey };
  }
  const provider = tts.provider || g.provider;
  if (!provider) return undefined;

  const baseUrl = getProviderBaseUrl(provider);
  if (baseUrl) {
    const model = tts.model || getProviderDefault(provider, 'text-to-speech') || '';
    const voice = getProviderTTSVoice(provider);
    return { provider, baseUrl, model, apiKey, voice };
  }
  // Native providers (e.g. Google) use their own REST API — no base URL needed.
  const defaultModel = getProviderDefault(provider, 'text-to-speech');
  if (defaultModel) {
    const model = tts.model || defaultModel || '';
    return { provider, model, apiKey };
  }
  return undefined;
}

export function resolveSTTOverride(settings: RequestSettings): STTOverride | undefined {
  const { stt, global: g } = settings;
  const apiKey = stt.apiKey || g.apiKey || undefined;
  const model = stt.model || undefined;
  if (stt.baseUrl) {
    return { provider: stt.provider || 'openai', baseUrl: stt.baseUrl, apiKey, model };
  }
  const provider = stt.provider || g.provider;
  if (!provider) return undefined;

  const baseUrl = getProviderBaseUrl(provider);
  if (baseUrl) {
    const resolvedModel = model || getProviderDefault(provider, 'speech-to-text') || '';
    return { provider, baseUrl, apiKey, model: resolvedModel };
  }
  // Native providers (e.g. Google) use their own REST API — no base URL needed.
  const defaultModel = getProviderDefault(provider, 'speech-to-text');
  if (defaultModel) {
    const resolvedModel = model || defaultModel || '';
    return { provider, apiKey, model: resolvedModel };
  }
  return undefined;
}

export function resolveImageOverride(settings: RequestSettings): ImageOverride | undefined {
  const { image } = settings;
  if (!image.provider) return undefined;
  const model = image.model || getProviderDefault(image.provider, 'text-to-image') || undefined;
  return { provider: image.provider, apiKey: image.apiKey, model, baseUrl: image.baseUrl || undefined };
}
