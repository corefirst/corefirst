import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deleteRoleplaySession,
  renameRoleplaySession,
} from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

interface Params { sessionId: string }

// Slug comes from the URL search params (?slug=foo) — sessions are scoped by
// the course they were started in. `null` / missing means the global record.
function resolveSlug(request: Request): string | null {
  const url = new URL(request.url);
  const raw = url.searchParams.get('slug');
  if (!raw || raw === 'global' || raw === '_global') return null;
  return raw;
}

/**
 * DELETE /api/history/roleplay/sessions/[sessionId]?slug=<slug>
 *
 * Cascade-deletes the session metadata document and every message in it.
 * Idempotent — a session already gone returns 200.
 */
export async function DELETE(request: Request, ctx: { params: Promise<Params> }) {
  const { sessionId } = await ctx.params;
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  try {
    const userId = await getUserId(request);
    await deleteRoleplaySession(userId, resolveSlug(request), sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[roleplay sessions DELETE] Error:', msg);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}

const PatchBody = z.object({ context: z.string().min(1).max(500) });

/**
 * PATCH /api/history/roleplay/sessions/[sessionId]?slug=<slug>
 *   body: { context: string }
 *
 * Renames the session's display title. The slug, sessionId, and message
 * stream are unaffected.
 */
export async function PATCH(request: Request, ctx: { params: Promise<Params> }) {
  const { sessionId } = await ctx.params;
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  try {
    const body = await request.json();
    const parsed = PatchBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const userId = await getUserId(request);
    await renameRoleplaySession(userId, resolveSlug(request), sessionId, parsed.data.context);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[roleplay sessions PATCH] Error:', msg);
    return NextResponse.json({ error: 'Failed to rename session' }, { status: 500 });
  }
}
