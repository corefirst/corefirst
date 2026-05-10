import type { ImageModel } from 'ai';
import { resolveFeature } from '../config';
import { googleImagenModel } from './sdk/google-imagen';
import { openaiImageModel } from './sdk/openai-image';

export function buildImageModel(): ImageModel {
  const r = resolveFeature('imageGen');
  if (r.provider === 'none') {
    return new Proxy({} as ImageModel, {
      get() {
        throw new Error(
          `[ai/imageGen] Image generation is disabled by default. Set ${r.envPrefix}_PROVIDER to enable.`
        );
      },
    });
  }

  switch (r.provider) {
    case 'google':
      return googleImagenModel(r.model, r.apiKey);
    case 'openai':
      return openaiImageModel(r.model, r.baseUrl, r.apiKey);
    default:
      throw new Error(`[ai/text-to-image] Unhandled provider "${r.provider}". This is a bug.`);
  }
}
