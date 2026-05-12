import { experimental_generateSpeech as generateSpeech, type SpeechModel } from 'ai';
import { ttsModel } from '@/src/lib/ai';
import { TTSProvider } from './interface';

const DEFAULT_VOICE = 'alloy';

/**
 * OpenAI-protocol TTS façade — works with both real OpenAI and any local
 * OpenAI-compatible server (Kokoro-FastAPI, Orpheus-FastAPI, Piper, Coqui
 * XTTS, etc.) configured via TTS_BASE_URL in `src/lib/ai`.
 *
 * Voice selection:
 *   TTS_VOICE env wins; otherwise defaults to 'alloy' (real OpenAI).
 *   Local servers use different voice names — set TTS_VOICE explicitly:
 *     Kokoro:   af_sky, af_bella, af_sarah, am_adam, …
 *     Orpheus:  tara, leo, jess, leah, dan, mia, zac, zoe
 *     Piper:    en_US-amy-low, en_GB-alan-low, …
 */
export class OpenAITTSProvider implements TTSProvider {
  private model: SpeechModel;
  constructor(model?: SpeechModel) { this.model = model ?? ttsModel; }

  async generateAudio(text: string): Promise<Uint8Array> {
    // Most TTS endpoints don't accept SSML — strip tags and decode entities.
    const cleanText = text
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const voice = process.env.TTS_VOICE ?? DEFAULT_VOICE;

    const { audio } = await generateSpeech({
      model: this.model,
      text: cleanText,
      voice,
    });

    return audio.uint8Array;
  }
}
