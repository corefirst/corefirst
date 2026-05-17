import type { VisualProvider } from './interface';

/**
 * OpenRouter image-generation provider.
 *
 * OpenRouter does NOT expose `/v1/images/generations` — calling that path 404s
 * with their site's HTML. Image generation is done via `/v1/chat/completions`
 * with `modalities: ["image", "text"]`; the generated image comes back as a
 * base64 data URL under `choices[0].message.images[0].image_url.url`.
 *
 * See https://openrouter.ai/docs/guides/overview/multimodal/image-generation.
 *
 * Style prefix is identical to AISDKImageProvider so cached pool entries
 * remain consistent across providers.
 */
export class OpenRouterImageProvider implements VisualProvider {
  constructor(
    private readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = 'https://openrouter.ai/api/v1',
  ) {}

  async generateImage(prompt: string, _options?: { size?: string }): Promise<string> {
    const styledPrompt = `A clean, educational illustration for a language learning app. Style: modern, flat vector, soft colors. Subject: ${prompt}`;

    const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: styledPrompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (!res.ok) {
      let cause: unknown;
      try { cause = await res.json(); } catch { cause = await res.text().catch(() => ''); }
      throw Object.assign(new Error(`OpenRouter image-gen ${res.status}`), { cause });
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    };
    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) {
      throw Object.assign(
        new Error('OpenRouter image-gen returned no image'),
        { cause: data },
      );
    }
    // Already a data URL — pass straight through to match AISDKImageProvider's
    // contract (route handler strips the data: prefix to derive raw bytes).
    return url;
  }
}
