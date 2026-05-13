import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId } from '@/src/lib/auth/user';
import { getSkillById, updateSkill, deleteSkill } from '@/src/lib/skills';

const UpdateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

/** GET /api/skills/[id] — fetch a single skill (own or community). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(request);
    const { id } = await params;
    const skill = await getSkillById(userId, id);
    if (!skill) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(skill);
  } catch {
    return NextResponse.json({ error: 'Failed to get skill' }, { status: 500 });
  }
}

/** PATCH /api/skills/[id] — update name, description, content, or tags. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(request);
    const { id } = await params;
    const body = UpdateSkillSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
    }
    const updated = await updateSkill(userId, id, body.data);
    return NextResponse.json(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = msg === 'Forbidden' ? 403 : msg === 'Skill not found' ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** DELETE /api/skills/[id] — delete a personal skill. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(request);
    const { id } = await params;
    await deleteSkill(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 });
  }
}
