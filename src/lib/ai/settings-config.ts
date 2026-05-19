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
  /** Cloud access token (forwarded as x-cf-cloud-token from the client). Required when
   *  provider === 'corefirst'. */
  cloudToken: string;
  /** Cloud base URL (forwarded as x-cf-cloud-base-url from the client, e.g.
   *  http://localhost:4000). Required when provider === 'corefirst'. */
  cloudBaseUrl: string;
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
// imageGen / tts / stt are intentionally absent: they are routed through
// resolveImageOverride / resolveTTSOverride / resolveSTTOverride instead.
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
    cloudToken:   getHeader(request, 'x-cf-cloud-token'),
    cloudBaseUrl: getHeader(request, 'x-cf-cloud-base-url'),
  };
}

/**
 * Build the AI gateway URL for the `corefirst` cloud provider given the
 * per-request cloud headers. Returns `${cloudBaseUrl}/v1/ai`, which is what the
 * OpenAI-compatible factories expect as `baseURL`.
 */
function corefirstBaseUrl(settings: RequestSettings): string {
  const root = (settings.cloudBaseUrl || '').replace(/\/+$/, '');
  return root ? `${root}/v1/ai` : '';
}

function hasTextSettings(s: RequestSettings): boolean {
  return !!(s.global.provider || s.text.provider);
}

export function resolveTextModel(settings: RequestSettings): LanguageModel | undefined {
  if (!hasTextSettings(settings)) return undefined;

  const provider = settings.text.provider || settings.global.provider;
  if (!provider) return undefined;

  let apiKey  = settings.text.apiKey  || settings.global.apiKey  || undefined;
  let baseUrl = provider === 'ollama' ? (settings.ollama.baseUrl || undefined) : undefined;
  const model = settings.text.model   || settings.global.model   || getDefaultTextModel(provider);

  if (provider === 'corefirst') {
    apiKey = settings.cloudToken || undefined;
    baseUrl = corefirstBaseUrl(settings) || undefined;
  }

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
    let apiKey  = settings.text.apiKey || settings.global.apiKey || undefined;
    let baseUrl: string | undefined = featureOverride.provider === 'ollama'
      ? (settings.ollama.baseUrl || undefined)
      : undefined;
    const model = featureOverride.model || getDefaultTextModel(featureOverride.provider);

    if (featureOverride.provider === 'corefirst') {
      apiKey = settings.cloudToken || undefined;
      baseUrl = corefirstBaseUrl(settings) || undefined;
    }

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

  if (provider === 'corefirst') {
    const baseUrl = corefirstBaseUrl(settings);
    if (!baseUrl || !settings.cloudToken) return undefined;
    const model = tts.model || getProviderDefault('corefirst', 'text-to-speech') || 'gpt-4o-mini-tts';
    return { provider, baseUrl, model, apiKey: settings.cloudToken, voice: getProviderTTSVoice('corefirst') };
  }

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

  if (provider === 'corefirst') {
    const baseUrl = corefirstBaseUrl(settings);
    if (!baseUrl || !settings.cloudToken) return undefined;
    const resolvedModel = model || getProviderDefault('corefirst', 'speech-to-text') || 'whisper-1';
    return { provider, baseUrl, apiKey: settings.cloudToken, model: resolvedModel };
  }

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
  const { image, global: g } = settings;
  const provider = image.provider || g.provider;
  if (!provider) return undefined;

  if (provider === 'corefirst') {
    const baseUrl = corefirstBaseUrl(settings);
    if (!baseUrl || !settings.cloudToken) return undefined;
    const model = image.model || getProviderDefault('corefirst', 'text-to-image') || 'gpt-image-1';
    return { provider, apiKey: settings.cloudToken, baseUrl, model };
  }

  const apiKey = image.apiKey || g.apiKey || undefined;
  // Note: We no longer return undefined if apiKey is missing. 
  // The factory will fall back to the server-side env var (IMAGE_GEN_API_KEY etc.)
  // if the override doesn't carry a key.

  const model = image.model || getProviderDefault(provider, 'text-to-image') || undefined;
  return {
    provider,
    apiKey: apiKey || '',
    model,
    baseUrl: image.baseUrl || getProviderBaseUrl(provider) || undefined
  };
}
