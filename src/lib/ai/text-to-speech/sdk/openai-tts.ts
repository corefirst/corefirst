import { openai, createOpenAI } from '@ai-sdk/openai';
import type { SpeechModel } from 'ai';

export function openaiTtsModel(model: string, baseUrl?: string, apiKey?: string): SpeechModel {
  if (!baseUrl && !apiKey) {
    return openai.speech(model as Parameters<typeof openai.speech>[0]);
  }
  // Custom baseUrl: covers local OpenAI-compatible TTS servers like
  // Kokoro-FastAPI (default :8880), Orpheus-FastAPI (default :5005),
  // Piper's openai-compat layer, etc.
  const provider = createOpenAI({
    baseURL: baseUrl,
    apiKey: apiKey ?? 'no-api-key-required',
    compatibility: 'compatible',
  });
  return provider.speech(model as Parameters<typeof provider.speech>[0]);
}
