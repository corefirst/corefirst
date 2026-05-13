import { NextResponse } from 'next/server';
import { STTFactory } from '@/src/core/stt/factory';
import { extractSettings, resolveSTTOverride } from '@/src/lib/ai/settings-config';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const LANG_MAP: Record<string, string> = {
  'English': 'en',
  'Chinese': 'zh',
  'Japanese': 'ja',
  'Korean': 'ko',
  'Vietnamese': 'vi',
  'Spanish': 'es',
  'French': 'fr',
  'German': 'de',
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const targetLang = formData.get('language') as string | null;

    if (!(audioFile instanceof Blob)) {
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
    return NextResponse.json({ error: 'Transcription failed', detail: msg }, { status: 500 });
  }
}
