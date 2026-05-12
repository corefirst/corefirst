import { NextResponse } from 'next/server';
import { deleteHistoryEvent, providerFor } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

interface Params { eventId: string }

/**
 * DELETE /api/history/roleplay/messages/[eventId]
 *
 * Deletes a single roleplay message. The eventId is the PouchDB `_id` of the
 * message document; tombstone replicates across devices. The owning session
 * stays — only the message is removed.
 */
/** PATCH — update the transcribed content of a stored voice message. */
export async function PATCH(request: Request, ctx: { params: Promise<Params> }) {
  const { eventId } = await ctx.params;
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  try {
    const userId = await getUserId(request);
    const { content } = await request.json();
    if (typeof content !== 'string') return NextResponse.json({ error: 'content required' }, { status: 400 });
    const provider = providerFor(userId);
    await provider.mutate<any>('events', decodeURIComponent(eventId), (doc) => ({
      ...doc,
      data: { ...doc.data, content },
    }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[roleplay messages PATCH] Error:', msg);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<Params> }) {
  const { eventId } = await ctx.params;
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  try {
    const userId = await getUserId(request);
    await deleteHistoryEvent(userId, decodeURIComponent(eventId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[roleplay messages DELETE] Error:', msg);
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }
}
