import { TTSProvider } from './interface';

const DASH_SCOPE_TTS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

/**
 * DashScope native TTS provider (Qwen3-TTS-Flash).
 * Integrated into the Multimodal Generation family.
 */
export class QwenTTSProvider implements TTSProvider {
  constructor(
    private apiKey: string,
    private model: string = 'qwen3-tts-flash',
    private voice: string = 'Cherry'
  ) {}

  async generateAudio(text: string): Promise<Uint8Array> {
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    if (!cleanText) return new Uint8Array(0);

    const body = {
      model: this.model,
      input: { text: cleanText },
      parameters: {
        voice: this.voice
      }
    };

    const response = await fetch(DASH_SCOPE_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'disable' // We want a single JSON response with a URL
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`DashScope TTS failed (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    
    // Qwen3-TTS in Multimodal API usually returns output.audio (string URL)
    // or output.audio.url (nested URL).
    let audioUrl = '';
    if (data.output?.audio) {
      audioUrl = typeof data.output.audio === 'string' 
        ? data.output.audio 
        : data.output.audio.url;
    }

    if (!audioUrl) {
      throw new Error(`DashScope TTS: No audio URL found in response: ${JSON.stringify(data)}`);
    }

    // Fetch binary from OSS
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Failed to fetch audio from DashScope OSS: ${audioRes.statusText}`);
    }

    const buffer = await audioRes.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
