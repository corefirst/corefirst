import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export function qwenTextModel(model: string, apiKey?: string): LanguageModel {
  const key = apiKey ?? process.env.QWEN_API_KEY ?? '';
  if (!key) console.warn('[ai/text/qwen] QWEN_API_KEY is not set.');
  const provider = createOpenAI({ baseURL: QWEN_BASE_URL, apiKey: key });
  return provider(model as Parameters<typeof provider>[0]);
}
