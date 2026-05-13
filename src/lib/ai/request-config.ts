import type { LanguageModel } from 'ai';
import { buildTextModelFromSpec } from './text/factory';
import { getDefaultTextModel } from './capabilities';

export interface BYOKConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export function buildBYOKModel(config: BYOKConfig): LanguageModel {
  const model = config.model || getDefaultTextModel(config.provider) || getDefaultTextModel('openrouter');
  return buildTextModelFromSpec({
    provider: config.provider,
    model,
    apiKey:  config.apiKey  || undefined,
    baseUrl: config.baseUrl || undefined,
  });
}
