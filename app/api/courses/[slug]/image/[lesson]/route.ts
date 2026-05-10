import { NextResponse } from 'next/server';
import { readPackageImage, PackageNotFoundError } from '@/src/lib/storage';

interface Params { slug: string; lesson: string }

export async function GET(_request: Request, ctx: { params: Promise<Params> }) {
  const { slug, lesson } = await ctx.params;
  const lessonIndex = Number(lesson);
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0) {
    return NextResponse.json({ error: 'Invalid lesson index' }, { status: 400 });
  }
  try {
    const bytes = await readPackageImage(slug, lessonIndex);
    if (!bytes) return NextResponse.json({ error: 'No image for this lesson' }, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    if (err instanceof PackageNotFoundError) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[courses/image] Error:', msg);
    return NextResponse.json({ error: 'Failed to read image' }, { status: 500 });
  }
}
