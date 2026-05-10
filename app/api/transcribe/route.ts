import { NextResponse } from 'next/server';
import { experimental_transcribe as transcribe } from 'ai';
import { sttModel } from '@/src/lib/ai';

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

    // Just transcribe, don't save. 
    // Saving happens in the roleplay API upon final submission.
    const { text } = await transcribe({ 
      model: sttModel, 
      audio: audioBytes,
      language: languageCode,
      maxRetries: 1
    });

    return NextResponse.json({ text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[transcribe] Error:', msg);
    return NextResponse.json({ 
      error: 'Transcription failed', 
      detail: msg,
      stack 
    }, { status: 500 });
  }
}
