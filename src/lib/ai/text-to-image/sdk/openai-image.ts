import { openai, createOpenAI } from '@ai-sdk/openai';
import type { ImageModel } from 'ai';

export function openaiImageModel(model: string, baseUrl?: string, apiKey?: string): ImageModel {
  if (!baseUrl && !apiKey) {
    return openai.image(model);
  }
  const provider = createOpenAI({
    baseURL: baseUrl,
    apiKey: apiKey ?? 'no-api-key-required',
    compatibility: 'compatible',
  });
  return provider.image(model);
}
