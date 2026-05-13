import { NextResponse } from 'next/server';
import { exportPackage, PackageNotFoundError } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

interface Params { slug: string }

const SLUG_RE = /^[a-z0-9-]+$/;

export async function GET(request: Request, ctx: { params: Promise<Params> }) {
  const { slug } = await ctx.params;
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  try {
    const userId = await getUserId(request);
    const buffer = await exportPackage(userId, slug);
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${slug}.corefirst"`,
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (err) {
    if (err instanceof PackageNotFoundError) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[courses/:slug/export] Error:', msg);
    return NextResponse.json({ error: 'Failed to export course' }, { status: 500 });
  }
}
