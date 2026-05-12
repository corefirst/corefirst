import type { LanguageModel } from 'ai';
import { buildTextModelFromSpec } from './text/factory';
import { PROVIDER_DEFAULT_MODELS } from '../constants';

export interface BYOKConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export function buildBYOKModel(config: BYOKConfig): LanguageModel {
  const model = config.model || PROVIDER_DEFAULT_MODELS[config.provider] || PROVIDER_DEFAULT_MODELS.openrouter;
  return buildTextModelFromSpec({
    provider: config.provider,
    model,
    apiKey:  config.apiKey  || undefined,
    baseUrl: config.baseUrl || undefined,
  });
}
