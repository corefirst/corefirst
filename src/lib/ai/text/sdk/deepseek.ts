import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export function deepseekTextModel(model: string, apiKey?: string): LanguageModel {
  const key = apiKey ?? process.env.DEEPSEEK_API_KEY ?? '';
  if (!key) console.warn('[ai/text/deepseek] DEEPSEEK_API_KEY is not set.');
  const provider = createOpenAI({ baseURL: DEEPSEEK_BASE_URL, apiKey: key });
  return provider(model as Parameters<typeof provider>[0]);
}
