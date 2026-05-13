export interface STTOptions {
  /** ISO-639-1 hint (e.g. "en", "zh"). Some providers honor it, others ignore. */
  language?: string;
  /** MIME type of the audio data (e.g. "audio/webm", "audio/wav"). Passed to
   *  the AI SDK so the provider knows the container format. */
  mimeType?: string;
}

export interface STTProvider {
  /** Transcribe audio bytes to text. */
  transcribe(audio: Uint8Array, opts?: STTOptions): Promise<{ text: string }>;
}

export type STTProviderType = 'openai' | 'google' | 'qwen' | 'openrouter';
