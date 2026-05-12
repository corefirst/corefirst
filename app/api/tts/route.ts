import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import { TTSFactory } from '@/src/core/tts/factory';
import { contentHash } from '@/src/lib/storage/hash';
import { sharedMediaPath, ensureDataDirs } from '@/src/lib/storage/paths';

const MAX_TTS_LEN = 4096;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text } = body;
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }
    if (text.length > MAX_TTS_LEN) {
      return NextResponse.json(
        { error: `Text exceeds ${MAX_TTS_LEN} character limit` },
        { status: 400 }
      );
    }

    const hash = contentHash(text);
    const filename = `${hash}.mp3`;
    const poolFile = sharedMediaPath(filename);

    try {
      // 1. Try to serve from shared media pool
      const cached = new Uint8Array(await fs.readFile(poolFile));
      return new Response(cached, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': cached.byteLength.toString(),
          'X-Cache': 'HIT',
        },
      });
    } catch {
      // 2. Generate if not in pool
      await ensureDataDirs();
      const provider = TTSFactory.getProvider();
      const audio = await provider.generateAudio(text);

      const bytes = new Uint8Array(audio.byteLength);
      bytes.set(audio);

      // 3. Save to pool for future reuse
      await fs.writeFile(poolFile, bytes);

      return new Response(bytes, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': bytes.byteLength.toString(),
          'X-Cache': 'MISS',
        },
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[tts] Error:', msg);
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 });
  }
}
