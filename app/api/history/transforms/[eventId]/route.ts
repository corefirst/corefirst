import { NextResponse } from 'next/server';
import { deleteHistoryEvent } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

interface Params { eventId: string }

/**
 * DELETE /api/history/transforms/[eventId]
 *
 * The eventId is the PouchDB `_id` of the transform event document. Delete is
 * idempotent (404 is success) and syncs to other devices via PouchDB
 * tombstones — no UI handling needed for cross-device deletion.
 */
export async function DELETE(request: Request, ctx: { params: Promise<Params> }) {
  const { eventId } = await ctx.params;
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  try {
    const userId = await getUserId(request);
    await deleteHistoryEvent(userId, decodeURIComponent(eventId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[history/transforms DELETE] Error:', msg);
    return NextResponse.json({ error: 'Failed to delete transform' }, { status: 500 });
  }
}
