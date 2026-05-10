import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ImageModel } from 'ai';

export function googleImagenModel(model: string, apiKeyOverride?: string): ImageModel {
  const apiKey =
    apiKeyOverride ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    '';
  if (!apiKey && process.env.NODE_ENV !== 'test') {
    console.warn(
      '[ai/text-to-image/google] Neither GOOGLE_GENERATIVE_AI_API_KEY nor GOOGLE_API_KEY is set. ' +
        'Image generation will fail at runtime.',
    );
  }
  const provider = createGoogleGenerativeAI({ apiKey });
  return provider.image(model);
}
