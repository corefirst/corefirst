import { NextResponse } from 'next/server';
import { readPackageImage, PackageNotFoundError } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

interface Params { slug: string; lesson: string }

export async function GET(request: Request, ctx: { params: Promise<Params> }) {
  const { slug, lesson } = await ctx.params;
  const lessonIndex = Number(lesson);
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0) {
    return NextResponse.json({ error: 'Invalid lesson index' }, { status: 400 });
  }
  try {
    const userId = await getUserId(request);
    const bytes = await readPackageImage(userId, slug, lessonIndex);
    if (!bytes) return NextResponse.json({ error: 'No image for this lesson' }, { status: 404 });
    // Copy required: readPackageImage returns a Uint8Array view into a larger
    // buffer; sending it directly can leak adjacent zip entry bytes.
    return new NextResponse(new Uint8Array(bytes), {
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
