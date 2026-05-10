import type { LanguageModel } from 'ai';
import { resolveFeature } from '../config';
import type { FeatureKey } from '../capabilities';
import { googleTextModel } from './sdk/google';
import { openaiTextModel } from './sdk/openai';
import { anthropicTextModel } from './sdk/anthropic';
import { ollamaTextModel } from './sdk/ollama';
import { openrouterTextModel } from './sdk/openrouter';
import { cliTextModel } from './cli/provider';

export function buildTextModelFor(feature: FeatureKey): LanguageModel {
  const r = resolveFeature(feature);
  if (r.provider === 'none') {
    return new Proxy({} as LanguageModel, {
      get() {
        throw new Error(
          `[ai/${feature}] Text generation for "${feature}" is disabled. Set ${r.envPrefix}_PROVIDER to enable.`
        );
      },
    });
  }

  switch (r.provider) {
    case 'google':
      return googleTextModel(r.model, r.apiKey);
    case 'openai':
      return openaiTextModel(r.model, r.baseUrl, r.apiKey);
    case 'anthropic':
      return anthropicTextModel(r.model, r.apiKey);
    case 'ollama':
      return ollamaTextModel(r.model);
    case 'openrouter':
      return openrouterTextModel(r.model, r.apiKey);
    case 'cli/claude':
      return cliTextModel('claude', r.model);
    case 'cli/gemini':
      return cliTextModel('gemini', r.model);
    default:
      throw new Error(`[ai/text] Unhandled provider "${r.provider}". This is a bug.`);
  }
}
