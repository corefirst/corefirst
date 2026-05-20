import { NextResponse } from 'next/server';
import { readPackageCfltAudio, PackageNotFoundError, PackageCorruptError } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

interface Params { slug: string; lesson: string; script: string }

const SLUG_RE = /^[a-z0-9-]+$/;

export async function GET(request: Request, ctx: { params: Promise<Params> }) {
  const { slug, lesson, script } = await ctx.params;
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }
  const lessonIndex = Number(lesson);
  const scriptIndex = Number(script);
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0 ||
      !Number.isInteger(scriptIndex) || scriptIndex < 0) {
    return NextResponse.json({ error: 'Invalid lesson/script index' }, { status: 400 });
  }
  try {
    const userId = await getUserId(request);
    const bytes = await readPackageCfltAudio(userId, slug, lessonIndex, scriptIndex);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    if (err instanceof PackageNotFoundError) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    if (err instanceof PackageCorruptError) {
      return NextResponse.json({ error: 'CRST audio asset missing from package' }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[courses/crst-audio] Error:', msg);
    return NextResponse.json({ error: 'Failed to read CRST audio' }, { status: 500 });
  }
}
