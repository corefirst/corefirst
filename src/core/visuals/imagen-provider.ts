import { generateImage, type ImageModel } from 'ai';
import { imageGenModel } from '@/src/lib/ai';
import { VisualProvider } from './interface';

/**
 * Generates educational illustrations via Google Imagen (default: imagen-4.0).
 *
 * Returns the image as a data: URL so the frontend can render it directly,
 * without needing to host the bytes elsewhere first. (Imagen does not return
 * persistent URLs the way DALL-E does — it returns binary data.)
 */
export class ImagenProvider implements VisualProvider {
  private model: ImageModel;
  constructor(model?: ImageModel) { this.model = model ?? imageGenModel; }

  async generateImage(prompt: string): Promise<string> {
    const styledPrompt = `A clean, educational illustration for a bilingual learning app. Style: Modern, flat vector, soft colors. Concept: ${prompt}`;

    const { image } = await generateImage({
      model: this.model,
      prompt: styledPrompt,
      aspectRatio: '1:1',
    });

    // image is a GeneratedFile with base64 + mediaType. Inline as data URL.
    return `data:${image.mediaType};base64,${image.base64}`;
  }
}
