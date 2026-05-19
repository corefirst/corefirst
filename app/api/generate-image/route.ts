import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import { VisualFactory } from '@/src/core/visuals/factory';
import { contentHash } from '@/src/lib/storage/hash';
import { sharedMediaPath, ensureDataDirs } from '@/src/lib/storage/paths';
import { extractSettings, resolveImageOverride } from '@/src/lib/ai/settings-config';
import { buildAIErrorResponse } from '@/src/lib/ai/errors';

const MAX_PROMPT_LEN = 1024;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, size } = body;
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT_LEN) {
      return NextResponse.json(
        { error: `Prompt exceeds ${MAX_PROMPT_LEN} character limit` },
        { status: 400 }
      );
    }

    const hash = contentHash(`${prompt}:${size || '1024x1024'}`);
    const filename = `${hash}.webp`;
    const poolFile = sharedMediaPath(filename);
    const publicUrl = `/api/media/${filename}`;

    try {
      // 1. Try shared pool first
      await fs.access(poolFile);
      return NextResponse.json({ url: publicUrl, cached: true });
    } catch {
      // 2. Generate
      await ensureDataDirs();
      const imageOverride = resolveImageOverride(extractSettings(request));
      const provider = VisualFactory.getProvider(imageOverride ?? undefined);
      const dataUrl = await provider.generateImage(prompt, { size });

      // 3. Save to pool
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const bytes = new Uint8Array(Buffer.from(base64Data, 'base64'));
      await fs.writeFile(poolFile, bytes);

      return NextResponse.json({ url: publicUrl, cached: false });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[generate-image] Error:', msg);
    const aiResponse = buildAIErrorResponse(error);
    if (aiResponse) return aiResponse;
    return NextResponse.json({ error: 'Image generation failed' }, { status: 500 });
  }
}
