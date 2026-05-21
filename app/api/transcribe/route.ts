import { NextResponse } from 'next/server';
import { STTFactory } from '@/src/core/stt/factory';
import { extractSettings, resolveSTTOverride } from '@/src/lib/ai/settings-config';
import { LANG_MAP } from '@/src/lib/constants';
import { buildAIErrorResponse } from '@/src/lib/ai/errors';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const targetLang = formData.get('language') as string | null;

    if (!audioFile || typeof (audioFile as any).arrayBuffer !== 'function' || typeof (audioFile as any).size !== 'number') {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio file exceeds 10 MB limit' }, { status: 400 });
    }

    const mimeType = audioFile.type || 'audio/webm';
    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const languageCode = targetLang ? LANG_MAP[targetLang] : undefined;

    const sttOverride = resolveSTTOverride(extractSettings(request));
    const provider = STTFactory.getProvider(sttOverride ?? undefined);

    // Just transcribe, don't save.
    // Saving happens in the roleplay API upon final submission.
    const { text } = await provider.transcribe(audioBytes, { language: languageCode, mimeType });

    return NextResponse.json({ text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[transcribe] Error:', msg || '(no message)');
    if (error instanceof Error && error.cause) console.error('[transcribe] Cause:', error.cause);
    if (error && typeof error === 'object') {
      const extra = JSON.stringify(error, Object.getOwnPropertyNames(error));
      if (extra !== '{}') console.error('[transcribe] Details:', extra);
    }
    const aiResponse = buildAIErrorResponse(error);
    if (aiResponse) return aiResponse;
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
