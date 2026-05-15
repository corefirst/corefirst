import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export function openrouterTextModel(model: string, apiKeyOverride?: string): LanguageModel {
  const apiKey = apiKeyOverride ?? process.env.OPENROUTER_API_KEY ?? '';
  if (!apiKey && process.env.NODE_ENV !== 'test') {
    console.warn('[ai/text/openrouter] OPENROUTER_API_KEY is not set.');
  }
  const provider = createOpenAI({ 
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    headers: {
      "HTTP-Referer": "https://corefirst.world",
      "X-Title": "CoreFirst",
    }
  });
  return provider(model);
}
