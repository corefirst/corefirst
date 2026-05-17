import { generateImage, type ImageModel } from 'ai';
import { imageGenModel } from '@/src/lib/ai';
import { VisualProvider } from './interface';
import { parseSize, getClosestAspectRatio, getClosestSize } from './size-utils';

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
  constructor(model?: ImageModel) { this.model = (model ?? imageGenModel) as ImageModel; }

  async generateImage(prompt: string, options?: { size?: string }): Promise<string> {
    const styledPrompt = `A clean, educational illustration for a language learning app. Style: modern, flat vector, soft colors. Subject: ${prompt}`;

    try {
      const params: any = {
        model: this.model,
        prompt: styledPrompt,
      };

      const requestedSize = options?.size || '1024x1024';
      const parsed = parseSize(requestedSize);
      
      if ((this.model as any).modelId?.includes('imagen')) {
        // Map common sizes to Google-supported aspect ratios
        if (parsed) {
          params.aspectRatio = getClosestAspectRatio(parsed.width, parsed.height, ['1:1', '16:9', '4:3', '3:4', '9:16']);
        } else {
          params.aspectRatio = '1:1';
        }
      } else if ((this.model as any).modelId?.includes('gpt-image-2')) {
        // gpt-image-2 (OpenAI 2026) has higher minimum resolution requirements.
        // Map requested size to its official supported sizes.
        const supported = ['1024x1024', '1792x1024', '1024x1792'];
        if (parsed) {
          params.size = getClosestSize(parsed.width, parsed.height, supported);
        } else {
          params.size = '1024x1024';
        }
      } else {
        // DALL-E and others use size
        params.size = requestedSize;
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
