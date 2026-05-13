import { NextResponse } from 'next/server';
import { getUserId } from '@/src/lib/auth/user';
import { forkSkill } from '@/src/lib/skills';

/** POST /api/skills/[id]/fork — copy a community skill into the user's personal library. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(request);
    const { id } = await params;
    const forked = await forkSkill(userId, id);
    return NextResponse.json(forked, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = msg.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
