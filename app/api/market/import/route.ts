/**
 * POST /api/market/import
 *
 * Receives a downloaded textbook .zip from the browser and imports it into
 * the user's local PouchDB / filesystem store. Body is the raw zip bytes;
 * the cloud download URL itself is fetched client-side because it carries
 * the user's presigned credentials.
 */
import { NextResponse } from 'next/server';
import { getUserId } from '@/src/lib/auth/user';
import { importPackage, PackageCorruptError } from '@/src/lib/storage/package';

export async function POST(request: Request) {
  try {
    const userId = await getUserId(request);
    const buf = new Uint8Array(await request.arrayBuffer());
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: 'Empty body' }, { status: 400 });
    }

    const { slug, packageId } = await importPackage(userId, buf);
    return NextResponse.json({ slug, packageId });
  } catch (error: any) {
    if (error instanceof PackageCorruptError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[market/import] Failed:', error?.message);
    return NextResponse.json({ error: error?.message || 'Import failed' }, { status: 500 });
  }
}
