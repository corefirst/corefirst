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

    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const languageCode = targetLang ? LANG_MAP[targetLang] : undefined;

    const sttOverride = resolveSTTOverride(extractSettings(request));
    const provider = STTFactory.getProvider(sttOverride ?? undefined);

    // Just transcribe, don't save.
    // Saving happens in the roleplay API upon final submission.
    const { text } = await provider.transcribe(audioBytes, { language: languageCode });

    return NextResponse.json({ text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[transcribe] Error:', msg);
    return NextResponse.json({ error: 'Transcription failed', detail: msg }, { status: 500 });
  }
}
