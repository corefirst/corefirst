export interface VisualProvider {
  /**
   * Generate an image from a prompt.
   * Returns either an HTTPS URL or a `data:` URL the frontend can render.
   */
  generateImage(prompt: string): Promise<string>;
}

export type VisualProviderType = 'google' | 'openai' | 'qwen' | 'openrouter';
