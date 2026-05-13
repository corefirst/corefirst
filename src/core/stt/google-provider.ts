import { resolveFeature } from '@/src/lib/ai';
import type { STTOptions, STTProvider } from './interface';

const LANG_NAMES: Record<string, string> = {
  en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  vi: 'Vietnamese', es: 'Spanish', fr: 'French', de: 'German',
};

/**
 * Gemini-based STT via the Generative Language REST API. Passes the audio as
 * an inline `audio/*` part and instructs the model to transcribe verbatim.
 *
 * NOTE: This is text-modality transcription — the model reads audio and emits
 * text. Quality is generally strong for clean speech but, like Whisper, it
 * tends to auto-correct mispronunciations, which limits its usefulness for
 * phoneme-level pronunciation grading. See speechEval feature notes.
 */
export class GoogleGeminiSTTProvider implements STTProvider {
  private readonly model: string;
  private readonly apiKey: string;

  constructor(opts?: { model?: string; apiKey?: string }) {
    const r = resolveFeature('stt');
    this.model = opts?.model || r.model;
    const key = opts?.apiKey || r.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) {
      throw new Error('[ai/stt] Google Gemini STT requires GOOGLE_GENERATIVE_AI_API_KEY (or GLOBAL_API_KEY).');
    }
    this.apiKey = key;
  }

  async transcribe(audio: Uint8Array, opts?: STTOptions): Promise<{ text: string }> {
    const mimeType = sniffAudioMime(audio);
    const b64 = uint8ArrayToBase64(audio);
    const langHint = opts?.language && LANG_NAMES[opts.language]
      ? ` The audio is in ${LANG_NAMES[opts.language]}.`
      : '';
    const prompt = `Transcribe the following audio verbatim.${langHint} Return only the spoken text — no annotations, no quotation marks, no language tags.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: b64 } },
            { text: prompt },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[ai/stt] Gemini STT HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const json = await res.json() as GeminiGenerateContentResponse;
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!text) {
      throw new Error('[ai/stt] Gemini STT response had no transcription text.');
    }
    return { text };
  }
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

// Gemini accepts: audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg, audio/flac, audio/webm.
function sniffAudioMime(bytes: Uint8Array): string {
  if (bytes.length >= 12) {
    const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const head4_8 = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (head === 'RIFF' && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WAVE') return 'audio/wav';
    if (head === 'OggS') return 'audio/ogg';
    if (head === 'fLaC') return 'audio/flac';
    if (head === '\x1aE\xdf\xa3') return 'audio/webm';
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mp3';
    if (head4_8 === 'ftyp') return 'audio/mp4';
  }
  return 'audio/webm';
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}
