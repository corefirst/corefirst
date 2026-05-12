import type { LanguageModel } from 'ai';
import { resolveFeature } from '../config';
import type { FeatureKey } from '../capabilities';
import { googleTextModel } from './sdk/google';
import { openaiTextModel } from './sdk/openai';
import { anthropicTextModel } from './sdk/anthropic';
import { ollamaTextModel } from './sdk/ollama';
import { openrouterTextModel } from './sdk/openrouter';
import { qwenTextModel } from './sdk/qwen';
import { deepseekTextModel } from './sdk/deepseek';
import { cliTextModel } from './cli/provider';

export interface TextModelSpec {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export function buildTextModelFromSpec(spec: TextModelSpec): LanguageModel {
  switch (spec.provider) {
    case 'google':
      return googleTextModel(spec.model, spec.apiKey);
    case 'openai':
      return openaiTextModel(spec.model, spec.baseUrl, spec.apiKey);
    case 'anthropic':
      return anthropicTextModel(spec.model, spec.apiKey);
    case 'ollama':
      return ollamaTextModel(spec.model, spec.baseUrl);
    case 'openrouter':
      return openrouterTextModel(spec.model, spec.apiKey);
    case 'groq':
      return openaiTextModel(spec.model, 'https://api.groq.com/openai/v1', spec.apiKey);
    case 'qwen':
      return qwenTextModel(spec.model, spec.apiKey);
    case 'deepseek':
      return deepseekTextModel(spec.model, spec.apiKey);
    case 'cli/claude':
      return cliTextModel('claude', spec.model);
    case 'cli/gemini':
      return cliTextModel('gemini', spec.model);
    default:
      throw new Error(`[ai/text] Unhandled provider "${spec.provider}".`);
  }
}

export function buildTextModelFor(feature: FeatureKey): LanguageModel {
  const r = resolveFeature(feature);
  if (r.provider === 'none') {
    return new Proxy({}, {
      get() {
        throw new Error(
          `[ai/${feature}] Text generation for "${feature}" is disabled. Set ${r.envPrefix}_PROVIDER to enable.`
        );
      },
    }) as LanguageModel;
  }
  return buildTextModelFromSpec({ provider: r.provider, model: r.model, apiKey: r.apiKey, baseUrl: r.baseUrl });
}
