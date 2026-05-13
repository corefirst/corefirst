import { NextResponse } from 'next/server';
import { getUserId } from '@/src/lib/auth/user';
import { publishSkill } from '@/src/lib/skills';

/** POST /api/skills/[id]/publish — make a skill public in the community catalog. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(request);
    const { id } = await params;
    const skill = await publishSkill(userId, id);
    return NextResponse.json(skill);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = msg === 'Forbidden' ? 403 : msg === 'Skill not found' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
