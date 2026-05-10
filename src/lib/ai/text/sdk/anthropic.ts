import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export function anthropicTextModel(model: string, apiKeyOverride?: string): LanguageModel {
  const apiKey = apiKeyOverride ?? process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey && process.env.NODE_ENV !== 'test') {
    console.warn('[ai/text/anthropic] ANTHROPIC_API_KEY is not set.');
  }
  const provider = createAnthropic({ apiKey });
  return provider(model as Parameters<typeof provider>[0]);
}
