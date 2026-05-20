import { NextResponse } from 'next/server';
import { getUserId } from '@/src/lib/auth/user';
import { readPack, writePack, deletePack, validatePackJSON } from '@/src/lib/roleplay-pack/loader';

export async function GET(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const userId = await getUserId(request);
  const entry = await readPack(userId, packId);
  if (!entry) return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  return NextResponse.json({ pack: entry.pack, source: entry.source });
}

export async function PUT(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const userId = await getUserId(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const validated = validatePackJSON(body);
  if (!validated.ok) {
    return NextResponse.json({ error: 'Validation failed', issues: validated.issues }, { status: 400 });
  }
  if (validated.pack.id !== packId) {
    return NextResponse.json({ error: `Pack id mismatch: URL=${packId} body=${validated.pack.id}` }, { status: 400 });
  }
  try {
    await writePack(userId, validated.pack);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const userId = await getUserId(request);
  const deleted = await deletePack(userId, packId);
  if (!deleted) return NextResponse.json({ error: 'Pack not found (or shared/bundled, cannot delete)' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
