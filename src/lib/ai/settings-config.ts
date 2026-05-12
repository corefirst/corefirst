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
import { buildTextModelFromSpec } from './text/factory';
import { PROVIDER_DEFAULT_MODELS } from '../constants';

export interface RequestSettings {
  global: { provider: string; apiKey: string; model: string };
  text:   { provider: string; model: string; apiKey: string };
  ollama: { baseUrl: string };
  tts:    { provider: string; baseUrl: string; model: string };
  stt:    { provider: string; baseUrl: string };
  image:  { provider: string; apiKey: string };
}

export interface TTSOverride  { provider: string; baseUrl: string; model: string }
export interface STTOverride  { provider: string; baseUrl: string }
export interface ImageOverride { provider: string; apiKey: string }


function getHeader(request: Request, name: string): string {
  return request.headers.get(name)?.trim() ?? '';
}

export function extractSettings(request: Request): RequestSettings {
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
    },
    stt: {
      provider: getHeader(request, 'x-cf-stt-provider'),
      baseUrl:  getHeader(request, 'x-cf-stt-url'),
    },
    image: {
      provider: getHeader(request, 'x-cf-image-provider'),
      apiKey:   getHeader(request, 'x-cf-image-key'),
    },
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
  const model   = settings.text.model   || settings.global.model   || PROVIDER_DEFAULT_MODELS[provider] || '';

  return buildTextModelFromSpec({ provider, model, apiKey, baseUrl });
}

// TODO: currently all text features (transform, roleplay, courseGen, speechEval) share the
// same global text model resolution. The `feature` param is accepted but unused — it exists
// so call sites can pass feature keys now and we can add per-feature overrides later without
// changing every route handler. Remove the underscore prefix when per-feature routing is added.
export function resolveFeatureFromSettings(
  _feature: FeatureKey,
  settings: RequestSettings,
): LanguageModel | undefined {
  return resolveTextModel(settings);
}

export function resolveTTSOverride(settings: RequestSettings): TTSOverride | undefined {
  const { tts } = settings;
  if (!tts.provider && !tts.baseUrl) return undefined;
  return { provider: tts.provider || 'openai', baseUrl: tts.baseUrl, model: tts.model };
}

export function resolveSTTOverride(settings: RequestSettings): STTOverride | undefined {
  const { stt } = settings;
  if (!stt.provider && !stt.baseUrl) return undefined;
  return { provider: stt.provider || 'openai', baseUrl: stt.baseUrl };
}

export function resolveImageOverride(settings: RequestSettings): ImageOverride | undefined {
  const { image } = settings;
  if (!image.provider) return undefined;
  return { provider: image.provider, apiKey: image.apiKey };
}
