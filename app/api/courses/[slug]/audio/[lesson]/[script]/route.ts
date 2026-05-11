import { NextResponse } from 'next/server';
import { readPackageAudio, PackageNotFoundError, PackageCorruptError } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

interface Params { slug: string; lesson: string; script: string }

// Defense in depth — see app/api/courses/[slug]/route.ts for rationale.
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
    const bytes = await readPackageAudio(userId, slug, lessonIndex, scriptIndex);
    // Copy required: readPackageAudio returns a Uint8Array view into a larger
    // buffer; sending it directly can leak adjacent zip entry bytes.
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
      return NextResponse.json({ error: 'Audio asset missing from package' }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[courses/audio] Error:', msg);
    return NextResponse.json({ error: 'Failed to read audio' }, { status: 500 });
  }
}
