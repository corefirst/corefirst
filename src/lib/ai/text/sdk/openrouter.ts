import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

export function openrouterTextModel(model: string, apiKeyOverride?: string): LanguageModel {
  const apiKey = apiKeyOverride ?? process.env.OPENROUTER_API_KEY ?? '';
  if (!apiKey && process.env.NODE_ENV !== 'test') {
    console.warn('[ai/text/openrouter] OPENROUTER_API_KEY is not set.');
  }
  const provider = createOpenRouter({ apiKey });
  return provider(model);
}
