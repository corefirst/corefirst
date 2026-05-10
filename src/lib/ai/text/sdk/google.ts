import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export function googleTextModel(model: string, apiKeyOverride?: string): LanguageModel {
  const apiKey =
    apiKeyOverride ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    '';
  if (!apiKey && process.env.NODE_ENV !== 'test') {
    console.warn(
      '[ai/text/google] Neither GOOGLE_GENERATIVE_AI_API_KEY nor GOOGLE_API_KEY is set. ' +
        'Text generation will fail at runtime.',
    );
  }
  const provider = createGoogleGenerativeAI({ apiKey });
  return provider(model as Parameters<typeof provider>[0]);
}
