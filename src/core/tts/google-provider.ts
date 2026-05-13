import { resolveFeature } from '@/src/lib/ai';
import { TTSProvider } from './interface';

const DEFAULT_VOICE = 'Kore';
const GEMINI_PCM_SAMPLE_RATE = 24000;
const GEMINI_PCM_BITS_PER_SAMPLE = 16;
const GEMINI_PCM_CHANNELS = 1;

/**
 * Gemini TTS via the Generative Language REST API. The model returns raw
 * 16-bit signed PCM @ 24 kHz mono via `inlineData`; we wrap it in a minimal
 * WAV header so the bytes can be played by `<audio>` and processed by the
 * same code path as OpenAI's mp3/wav output.
 */
export class GoogleGeminiTTSProvider implements TTSProvider {
  private readonly model: string;
  private readonly apiKey: string;

  constructor(opts?: { model?: string; apiKey?: string }) {
    const r = resolveFeature('tts');
    this.model = opts?.model || r.model;
    const key = opts?.apiKey || r.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) {
      throw new Error('[ai/tts] Google Gemini TTS requires GOOGLE_GENERATIVE_AI_API_KEY (or GLOBAL_API_KEY).');
    }
    this.apiKey = key;
  }

  async generateAudio(text: string): Promise<Uint8Array> {
    const cleanText = stripMarkup(text);
    const voice = process.env.TTS_VOICE || DEFAULT_VOICE;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: cleanText }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[ai/tts] Gemini TTS HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const json = await res.json() as GeminiGenerateContentResponse;
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const b64 = part?.inlineData?.data;
    if (!b64) {
      throw new Error('[ai/tts] Gemini TTS response had no inline audio data.');
    }
    const pcm = base64ToUint8Array(b64);
    return wrapPcmInWav(pcm, GEMINI_PCM_SAMPLE_RATE, GEMINI_PCM_CHANNELS, GEMINI_PCM_BITS_PER_SAMPLE);
  }
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
}

function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function base64ToUint8Array(b64: string): Uint8Array {
  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function wrapPcmInWav(pcm: Uint8Array, sampleRate: number, channels: number, bitsPerSample: number): Uint8Array {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}
