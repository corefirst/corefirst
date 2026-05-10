import { openai, createOpenAI } from '@ai-sdk/openai';
import type { TranscriptionModel } from 'ai';

export function openaiSttModel(model: string, baseUrl?: string, apiKey?: string): TranscriptionModel {
  if (!baseUrl && !apiKey) {
    return openai.transcription(model as Parameters<typeof openai.transcription>[0]);
  }
  // Custom baseUrl: covers local OpenAI-compatible STT servers like
  // faster-whisper-server, whisper.cpp's HTTP mode, Voxtral, etc.
  const provider = createOpenAI({
    baseURL: baseUrl,
    apiKey: apiKey ?? 'no-api-key-required',
  });
  return provider.transcription(model as Parameters<typeof provider.transcription>[0]);
}
