import { VisualProvider } from './interface';

const DASH_SCOPE_WANX_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';

/**
 * DashScope native Visual provider (Wanx-v1).
 * Uses the native DashScope image synthesis API.
 */
export class QwenVisualProvider implements VisualProvider {
  constructor(
    private apiKey: string,
    private model: string = 'wanx-v1'
  ) {}

  async generateImage(prompt: string): Promise<string> {
    const styledPrompt = `A clean, educational illustration for a language learning app. Style: modern, flat vector, soft colors. Subject: ${prompt}`;

    const body = {
      model: this.model,
      input: {
        prompt: styledPrompt
      },
      parameters: {
        style: '<flat illustration>', 
        size: '1024*1024',
        n: 1
      }
    };

    const response = await fetch(DASH_SCOPE_WANX_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable' 
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`DashScope Wanx submission failed (${response.status}): ${errorText}`);
    }

    const text = await response.text();
    if (!text) throw new Error('DashScope Wanx: Empty response from server');
    
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`DashScope Wanx: Invalid JSON response: ${text}`);
    }

    let taskId = data.output?.task_id;
    if (!taskId) {
        // Check if it returned the result directly
        if (data.output?.results?.[0]?.url) {
            return await this.fetchImageAsDataUrl(data.output.results[0].url);
        }
        throw new Error(`DashScope Wanx: No task ID or result found: ${JSON.stringify(data)}`);
    }

    // Polling for async task
    return await this.pollTask(taskId);
  }

  private async pollTask(taskId: string): Promise<string> {
    const pollUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
    const maxRetries = 30;
    const delay = 2000;

    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, delay));

      const response = await fetch(pollUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`DashScope Wanx poll failed (${response.status})`);
      }

      const text = await response.text();
      if (!text || !text.trim().startsWith('{')) continue; // Try again next poll

      let data: any;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.warn(`[visuals/qwen] Failed to parse poll response: ${text.slice(0, 100)}...`);
        continue;
      }
      const status = data.output?.task_status;

      if (status === 'SUCCEEDED') {
        const url = data.output?.results?.[0]?.url;
        if (!url) throw new Error('DashScope Wanx: Success but no image URL');
        return await this.fetchImageAsDataUrl(url);
      } else if (status === 'FAILED') {
        throw new Error(`DashScope Wanx task failed: ${data.output?.message || 'Unknown error'}`);
      }
      // PENDING or RUNNING, continue polling
    }

    throw new Error('DashScope Wanx: Polling timed out');
  }

  private async fetchImageAsDataUrl(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image from DashScope OSS: ${response.statusText}`);
    
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${base64}`;
  }
}
