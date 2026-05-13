import { NextResponse } from 'next/server';
import { importPackage, PackageCorruptError } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

// 50 MB — generous for a course with audio/images; anything larger is suspect.
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const userId = await getUserId(request);

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
    }

    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_IMPORT_BYTES / 1024 / 1024} MB)` },
        { status: 413 },
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = await importPackage(userId, buffer);

    return NextResponse.json({ ok: true, slug: result.slug, packageId: result.packageId });
  } catch (err) {
    if (err instanceof PackageCorruptError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[courses/import] Error:', msg);
    return NextResponse.json({ error: 'Failed to import course' }, { status: 500 });
  }
}
