import { experimental_transcribe as transcribe, type TranscriptionModel } from 'ai';
import { sttModel } from '@/src/lib/ai';
import type { STTOptions, STTProvider } from './interface';

/**
 * OpenAI-protocol STT façade. Works with real OpenAI (whisper-1, gpt-4o-mini-transcribe)
 * and any OpenAI-compatible local server (faster-whisper-server, whisper.cpp, …)
 * pointed at via STT_BASE_URL.
 */
export class OpenAISTTProvider implements STTProvider {
  private readonly model: TranscriptionModel;
  constructor(model?: TranscriptionModel) { this.model = model ?? sttModel; }

  async transcribe(audio: Uint8Array, opts?: STTOptions): Promise<{ text: string }> {
    const { text } = await transcribe({
      model: this.model,
      audio,
      // `openai` namespace is the AI-SDK convention for OpenAI-compat endpoints.
      // Non-OpenAI backends (Qwen, OpenRouter Whisper) silently ignore unknown namespaces.
      providerOptions: opts?.language ? { openai: { language: opts.language } } : undefined,
      maxRetries: 1,
    });
    return { text };
  }
}
