import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import { sharedMediaPath, mediaPath } from '@/src/lib/storage/paths';
import { getUserId } from '@/src/lib/auth/user';

interface Params { filename: string }

// All media files are named {16-char hex hash}.{ext} by contentHash().
// Anything outside this pattern is rejected to prevent path traversal.
const SAFE_FILENAME_RE = /^[a-f0-9]{16}\.(mp3|webp|mp4|webm)$/;

const CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'audio/webm',
};

export async function GET(request: Request, ctx: { params: Promise<Params> }) {
  const { filename } = await ctx.params;
  if (!filename || !SAFE_FILENAME_RE.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const ext = filename.split('.').pop()!;
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  };

  // 1. Try shared pool (TTS audio, generated images)
  try {
    const bytes = new Uint8Array(await fs.readFile(sharedMediaPath(filename)));
    return new Response(bytes, { status: 200, headers });
  } catch { /* not in shared pool */ }

  // 2. Fall back to per-user pool (voice recordings .webm, legacy files)
  try {
    const userId = await getUserId(request);
    const bytes = new Uint8Array(await fs.readFile(mediaPath(userId, filename)));
    return new Response(bytes, { status: 200, headers });
  } catch (err) {
    console.error('[media] Failed to read file:', filename, err);
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }
}
