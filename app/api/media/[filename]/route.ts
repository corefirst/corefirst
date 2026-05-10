import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import { mediaPath } from '@/src/lib/storage/paths';

interface Params { filename: string }

export async function GET(_request: Request, ctx: { params: Promise<Params> }) {
  const { filename } = await ctx.params;
  if (!filename) return NextResponse.json({ error: 'Missing filename' }, { status: 400 });

  try {
    const path = mediaPath(filename);
    const bytes = await fs.readFile(path);
    
    let contentType = 'application/octet-stream';
    if (filename.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (filename.endsWith('.webp')) contentType = 'image/webp';
    else if (filename.endsWith('.mp4')) contentType = 'video/mp4';

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }
}
