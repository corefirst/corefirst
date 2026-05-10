export interface TTSProvider {
  /**
   * Generate audio bytes from text (or SSML, depending on the provider).
   * Returns raw audio bytes (MP3 or provider-default format).
   */
  generateAudio(text: string): Promise<Uint8Array>;
}

export type TTSProviderType = 'openai';
