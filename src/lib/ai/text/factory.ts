import type { LanguageModel } from 'ai';
import { resolveFeature } from '../config';
import { InvalidProviderError, type FeatureKey } from '../capabilities';
import { googleTextModel } from './sdk/google';
import { openaiTextModel } from './sdk/openai';
import { anthropicTextModel } from './sdk/anthropic';
import { ollamaTextModel } from './sdk/ollama';
import { openrouterTextModel } from './sdk/openrouter';
import { qwenTextModel } from './sdk/qwen';
import { deepseekTextModel } from './sdk/deepseek';
import { cliTextModel } from './cli/provider';
import { corefirstTextModel } from './sdk/corefirst';

export interface TextModelSpec {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /** When provider === 'corefirst', optional pass-through to a specific upstream provider. */
  upstreamProvider?: string;
  /** When provider === 'corefirst', optional BYOK key forwarded to upstream. */
  upstreamApiKey?: string;
}

type TextModelBuilder = (spec: TextModelSpec) => LanguageModel;

const registry = new Map<string, TextModelBuilder>();

/** Register a text-model builder for a provider id. */
export function registerTextModelBuilder(provider: string, builder: TextModelBuilder): void {
  registry.set(provider, builder);
}

// ── Built-in providers ────────────────────────────────────────────────────────
registerTextModelBuilder('google',     (s) => googleTextModel(s.model, s.apiKey));
registerTextModelBuilder('openai',     (s) => openaiTextModel(s.model, s.baseUrl, s.apiKey));
registerTextModelBuilder('anthropic',  (s) => anthropicTextModel(s.model, s.apiKey));
registerTextModelBuilder('ollama',     (s) => ollamaTextModel(s.model, s.baseUrl));
registerTextModelBuilder('openrouter', (s) => openrouterTextModel(s.model, s.apiKey));
registerTextModelBuilder('groq',       (s) => openaiTextModel(s.model, 'https://api.groq.com/openai/v1', s.apiKey));
registerTextModelBuilder('qwen',       (s) => qwenTextModel(s.model, s.apiKey));
registerTextModelBuilder('deepseek',   (s) => deepseekTextModel(s.model, s.apiKey));
registerTextModelBuilder('cli/claude', (s) => cliTextModel('claude', s.model));
registerTextModelBuilder('cli/gemini', (s) => cliTextModel('gemini', s.model));
registerTextModelBuilder('corefirst', (s) => {
  if (!s.baseUrl) throw new Error('[ai/corefirst] missing baseUrl — set NEXT_PUBLIC_COREFIRST_SERVER_URL or pass baseUrl');
  if (!s.apiKey)  throw new Error('[ai/corefirst] missing access token — user must log in to SaaS first');
  return corefirstTextModel({
    model: s.model,
    baseUrl: s.baseUrl,
    accessToken: s.apiKey,
    upstreamProvider: s.upstreamProvider,
    upstreamApiKey: s.upstreamApiKey,
  });
});

export function buildTextModelFromSpec(spec: TextModelSpec): LanguageModel {
  const builder = registry.get(spec.provider);
  if (!builder) throw new InvalidProviderError(spec.provider, 'text');
  return builder(spec);
}

export function buildTextModelFor(feature: FeatureKey): LanguageModel {
  const r = resolveFeature(feature);
  if (r.provider === 'none') {
    return new Proxy({}, {
      get() {
        throw new Error(
          `[ai/${feature}] Text generation is disabled. Set ${r.envPrefix}_PROVIDER to enable.`
        );
      },
    }) as LanguageModel;
  }
  return buildTextModelFromSpec({ provider: r.provider, model: r.model, apiKey: r.apiKey, baseUrl: r.baseUrl });
}
