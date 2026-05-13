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
    try {
      const { text } = await transcribe({
        model: this.model,
        audio,
        // `openai` namespace is the AI-SDK convention for OpenAI-compat endpoints.
        // Non-OpenAI backends (Qwen, OpenRouter Whisper) silently ignore unknown namespaces.
        providerOptions: opts?.language ? { openai: { language: opts.language } } : undefined,
        maxRetries: 0,
      });
      return { text };
    } catch (e) {
      // Re-throw with richer details so the route can log them.
      const cause = (e as { responseBody?: unknown })?.responseBody ?? (e as { data?: unknown })?.data;
      if (cause) throw Object.assign(new Error((e as Error).message ?? ''), { cause });
      throw e;
    }
  }
}
