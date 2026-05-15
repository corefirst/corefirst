import { VisualProvider } from './interface';

/**
 * Custom Visual provider for Ollama.
 * 
 * Ollama's experimental /v1/images/generations endpoint returns 
 * application/x-ndjson (streaming JSON lines) instead of a single 
 * JSON object, which breaks standard OpenAI SDK adapters.
 */
export class OllamaImageProvider implements VisualProvider {
  private modelName: string;

  constructor(
    private baseUrl: string,
    model: string = 'x/z-image-turbo:latest',
    private apiKey?: string
  ) {
    // Ensure model has a tag, defaulting to :latest if missing
    this.modelName = model.includes(':') ? model : `${model}:latest`;
  }

  async generateImage(prompt: string, options?: { size?: string }): Promise<string> {
    const styledPrompt = `A clean, educational illustration for a language learning app. Style: modern, flat vector, soft colors. Subject: ${prompt}`;

    // Path 1: Try the OpenAI-compatible /v1 endpoint (more standard)
    try {
      const result = await this.tryV1Endpoint(styledPrompt, options?.size);
      if (result) return result;
    } catch (e) {
      console.warn(`[visuals/ollama] /v1 endpoint failed, trying fallback: ${(e as Error).message}`);
    }

    // Path 2: Fallback to the native /api/generate endpoint
    console.log(`[visuals/ollama] attempting fallback to native /api/generate`);
    return await this.tryNativeEndpoint(styledPrompt, options?.size);
  }

  private async tryV1Endpoint(prompt: string, size?: string): Promise<string | null> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/images/generations`;
    const body = {
      model: this.modelName,
      prompt,
      n: 1,
      size: size || '1024x1024',
      response_format: 'b64_json',
      stream: false // Explicitly disable streaming
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (this.apiKey && this.apiKey !== 'no-api-key-required') {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); 

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        if (errText.includes('EOF')) {
          console.error('[visuals/ollama] /v1 EOF detected. This is a model crash, likely OOM/VRAM issue.');
        }
        return null;
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        throw new Error('Ollama: Empty response (possible model crash)');
      }

      // Ollama's /v1/images/generations is buggy and returns NDJSON even when stream:false
      let data: any;
      if (text.includes('\n')) {
        const lines = text.trim().split('\n');
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.data?.[0]?.b64_json || parsed.b64_json) {
              data = parsed;
              break;
            }
          } catch (e) {}
        }
      }

      if (!data) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error('[visuals/ollama] Failed to parse /v1 response:', text.slice(0, 100));
          return null;
        }
      }
      
      const b64 = data.data?.[0]?.b64_json || data.b64_json;
      if (b64) return `data:image/webp;base64,${b64}`;
      
      return null;
    } catch (e) {
      if ((e as Error).message.includes('Empty response')) throw e;
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async tryNativeEndpoint(prompt: string, size?: string): Promise<string> {
    const nativeUrl = `${this.baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '')}/api/generate`;
    
    const body: any = {
      model: this.modelName,
      prompt,
      stream: false // Explicitly disable streaming
    };

    // If size is provided (e.g. "512x512"), parse it for Ollama options
    if (size && size.includes('x')) {
      const [w, h] = size.split('x').map(s => parseInt(s, 10));
      if (!isNaN(w) && !isNaN(h)) {
        body.options = {
          width: w,
          height: h
        };
      }
    }

    const response = await fetch(nativeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (errText.includes('EOF')) {
        throw new Error('Ollama model crash (EOF). Check VRAM/Memory.');
      }
      throw new Error(`Ollama native API failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    console.log(`[visuals/ollama] native response keys: ${Object.keys(data).join(', ')}`);
    
    // Check all possible fields for image data
    const b64 = data.response || (data.images && data.images[0]) || data.image;
    
    if (!b64) {
      console.error('[visuals/ollama] No image data in native response. Full keys:', Object.keys(data));
      throw new Error('Ollama native: No image data in response');
    }

    return `data:image/webp;base64,${b64}`;
  }
}
