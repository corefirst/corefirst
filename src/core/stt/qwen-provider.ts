import type { STTOptions, STTProvider } from './interface';

// SenseVoice wraps output with special tokens like <|Speech|>, <|NEUTRAL|>,
// <|zh|>, <|BGM|> etc. Strip them to get clean plain text.
function stripSenseVoiceTags(text: string): string {
  return text.replace(/<\|[^|]*\|>/g, '').trim();
}

const DASHSCOPE_ASR_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';
const DASHSCOPE_TASK_URL = 'https://dashscope.aliyuncs.com/api/v1/tasks';
const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = 30_000;

/**
 * DashScope native ASR provider (Paraformer / SenseVoice).
 *
 * DashScope's OpenAI-compatible endpoint does NOT support /audio/transcriptions,
 * so we call their native async batch API and poll until the job completes.
 * Suitable for short recordings (< 60 s) typical in voice-challenge use.
 */
export class QwenSTTProvider implements STTProvider {
  constructor(private apiKey: string, private model: string) {}

  async transcribe(audio: Uint8Array, opts?: STTOptions): Promise<{ text: string }> {
    // DashScope batch ASR requires a file URL. We use a data: URL so no
    // external storage is needed for short browser recordings.
    const base64 = Buffer.from(audio).toString('base64');
    const dataUrl = `data:audio/webm;base64,${base64}`;

    const submitBody: Record<string, unknown> = {
      model: this.model,
      input: { file_urls: [dataUrl] },
    };
    if (opts?.language) {
      submitBody.parameters = { language_hints: [opts.language] };
    }

    const submitRes = await fetch(DASHSCOPE_ASR_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(submitBody),
    });

    if (!submitRes.ok) {
      const body = await submitRes.text().catch(() => '');
      throw new Error(`DashScope ASR submit failed (${submitRes.status}): ${body}`);
    }

    const submitData = await submitRes.json() as { output?: { task_id?: string } };
    const taskId = submitData.output?.task_id;
    if (!taskId) {
      throw new Error(`DashScope ASR: no task_id in response: ${JSON.stringify(submitData)}`);
    }

    // Poll until SUCCEEDED or FAILED.
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${DASHSCOPE_TASK_URL}/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!pollRes.ok) continue;

      const pollData = await pollRes.json() as {
        output?: { task_status?: string; results?: Array<{ transcription?: string }> };
      };
      const status = pollData.output?.task_status;

      if (status === 'SUCCEEDED') {
        const result = (pollData.output?.results?.[0] ?? {}) as Record<string, unknown>;
        // DashScope SenseVoice returns a transcription_url pointing to a JSON
        // file on OSS — fetch it to get the actual transcript text.
        const transcriptionUrl = result['transcription_url'] as string | undefined;
        if (transcriptionUrl) {
          const tRes = await fetch(transcriptionUrl);
          if (tRes.ok) {
            const tData = await tRes.json() as Record<string, unknown>;
            console.log('[ai/stt/qwen] transcription JSON:', JSON.stringify(tData).slice(0, 300));
                // Format varies; try common field paths
            const raw =
              (tData['transcripts'] as Array<Record<string, unknown>>)?.[0]?.['text']
              ?? (tData['transcription'] as Array<Record<string, unknown>>)?.[0]?.['text']
              ?? tData['text']
              ?? '';
            return { text: stripSenseVoiceTags(String(raw)) };
          }
        }
        // Fallback: text may be inline in older API versions
        const text = result['transcription'] ?? result['text'] ?? result['transcript'] ?? '';
        return { text: String(text) };
      }
      if (status === 'FAILED') {
        throw new Error(`DashScope ASR task failed: ${JSON.stringify(pollData)}`);
      }
      // PENDING / RUNNING — keep polling
    }

    throw new Error('DashScope ASR timed out after 30 s');
  }
}
