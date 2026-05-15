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
      const { image } = await generateImage({
        model: this.model,
        prompt: styledPrompt,
        size: options?.size as any || '1024x1024',
      });

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
