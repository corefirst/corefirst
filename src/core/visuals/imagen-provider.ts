import { generateImage, type ImageModel } from 'ai';
import { imageGenModel } from '@/src/lib/ai';
import { VisualProvider } from './interface';

/**
 * AI-SDK ImageModel wrapper — works with any provider that the AI-SDK
 * ImageModel interface supports: Google Imagen, OpenAI DALL-E, Qwen Wanx,
 * OpenRouter image proxies, etc.
 *
 * Returns the image as a data: URL. Note that DALL-E returns a remote URL
 * which the AI-SDK normalises to base64 for us via `image.base64`.
 */
export class AISDKImageProvider implements VisualProvider {
  private model: ImageModel;
  constructor(model?: ImageModel) { this.model = model ?? imageGenModel; }

  async generateImage(prompt: string, options?: { size?: string }): Promise<string> {
    const styledPrompt = `A clean, educational illustration for a language learning app. Style: modern, flat vector, soft colors. Subject: ${prompt}`;

    try {
      const params: any = {
        model: this.model,
        prompt: styledPrompt,
      };

      // Smart Mapping: Determine whether to use 'size' or 'aspectRatio'
      // Google Imagen via AI-SDK prefers aspectRatio.
      // OpenAI DALL-E prefers size.
      const size = options?.size || '1024x1024';
      
      if (this.model.modelId.includes('imagen')) {
        // Map common sizes to Google-supported aspect ratios
        if (size === '896x512' || size === '1280x720') {
          params.aspectRatio = '16:9';
        } else if (size === '1024x768' || size === '640x480') {
          params.aspectRatio = '4:3';
        } else if (size === '768x1024' || size === '480x640') {
          params.aspectRatio = '3:4';
        } else if (size === '720x1280') {
          params.aspectRatio = '9:16';
        } else {
          params.aspectRatio = '1:1';
        }
      } else if (this.model.modelId.includes('gpt-image-2')) {
        // gpt-image-2 (OpenAI 2026) has higher minimum resolution requirements.
        // Map 896x512 to its official landscape size.
        if (size === '896x512' || size === '1280x720') {
          params.size = '1792x1024';
        } else {
          params.size = '1024x1024';
        }
      } else {
        // DALL-E and others use size
        params.size = size;
      }

      const { image } = await generateImage(params);

      // image is a GeneratedFile with base64 + mediaType. Inline as data URL.
      return `data:${image.mediaType};base64,${image.base64}`;
    } catch (e) {
      const msg = (e as Error).message || 'Unknown image generation error';
      const cause = (e as { responseBody?: unknown })?.responseBody ?? (e as { data?: unknown })?.data;
      if (cause) {
        console.error('[ai/imageGen] error cause:', JSON.stringify(cause));
        const errorWithCause = new Error(msg);
        (errorWithCause as any).cause = cause;
        throw errorWithCause;
      }
      throw e;
    }
  }
}
