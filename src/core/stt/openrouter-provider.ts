import type { STTOptions, STTProvider } from './interface';

/**
 * OpenRouter STT provider.
 *
 * OpenRouter's /v1/audio/transcriptions endpoint is NOT OpenAI-compatible at
 * the wire level: it accepts a JSON body with base64-encoded audio under
 * `input_audio.data` plus a `format` discriminator, instead of OpenAI's
 * multipart `file` upload. The AI-SDK's `openai.transcription()` therefore
 * 500s against every model — we have to call the endpoint directly.
 *
 * See https://openrouter.ai/docs/guides/overview/multimodal/stt for the spec.
 */
export class OpenRouterSTTProvider implements STTProvider {
  constructor(
    private readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = 'https://openrouter.ai/api/v1',
  ) {}

  async transcribe(audio: Uint8Array, opts?: STTOptions): Promise<{ text: string }> {
    const format = mimeToFormat(opts?.mimeType);
    // Base64-encode raw bytes (Buffer is available in Node; the route handler
    // runs server-side, so Buffer is safe). Avoid String.fromCharCode chunking
    // tricks: Buffer handles arbitrarily large inputs without stack limits.
    const dataB64 = Buffer.from(audio).toString('base64');

    const body = {
      model: this.model,
      input_audio: { data: dataB64, format },
      ...(opts?.language ? { language: opts.language } : {}),
    };

    const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Surface the upstream JSON in the thrown cause so the route logger
      // (which already prints `cause`) shows the real OpenRouter error text
      // instead of the generic "Internal Server Error" we keep hitting.
      let cause: unknown;
      try { cause = await res.json(); } catch { cause = await res.text().catch(() => ''); }
      throw Object.assign(new Error(`OpenRouter STT ${res.status}`), { cause });
    }

    const data = await res.json() as { text?: string };
    return { text: data.text ?? '' };
  }
}

function mimeToFormat(mime?: string): string {
  if (!mime) return 'webm';
  const m = mime.toLowerCase().split(';')[0].trim();
  switch (m) {
    case 'audio/webm': return 'webm';
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav': return 'wav';
    case 'audio/mpeg':
    case 'audio/mp3':  return 'mp3';
    case 'audio/ogg':  return 'ogg';
    case 'audio/mp4':
    case 'audio/m4a':
    case 'audio/x-m4a': return 'm4a';
    case 'audio/flac': return 'flac';
    case 'audio/aac':  return 'aac';
    default: return 'webm';
  }
}
