import { openai, createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export function openaiTextModel(model: string, baseUrl?: string, apiKey?: string): LanguageModel {
  // No overrides: use the package-default singleton (reads OPENAI_API_KEY
  // and the standard OpenAI URL).
  if (!baseUrl && !apiKey) {
    return openai(model as Parameters<typeof openai>[0]);
  }
  // Custom baseUrl / apiKey: build a fresh provider instance. This is the
  // path for local OpenAI-compatible servers (LM Studio, vLLM, llama.cpp's
  // server mode, Ollama's /v1 endpoint, etc.).
  const provider = createOpenAI({
    baseURL: baseUrl,
    apiKey: apiKey ?? 'no-api-key-required',
  });
  return provider(model as Parameters<typeof provider>[0]);
}
