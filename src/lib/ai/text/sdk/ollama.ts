import { createOllama } from 'ollama-ai-provider-v2';
import type { LanguageModel } from 'ai';

export function ollamaTextModel(model: string, baseUrlOverride?: string): LanguageModel {
  // OLLAMA_BASE_URL is conventionally the host root (http://localhost:11434),
  // but ollama-ai-provider-v2 expects the API root with `/api` appended (it
  // calls `${baseURL}/chat`). Accept either form.
  const raw = (baseUrlOverride ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  const baseURL = /\/api$/.test(raw) ? raw : `${raw}/api`;
  const provider = createOllama({ baseURL });
  return provider(model);
}
