import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId } from '@/src/lib/auth/user';
import { getUserSkills, createSkill, isFeatureSlot } from '@/src/lib/skills';

const CreateSkillSchema = z.object({
  featureSlot: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  content: z.string().min(1),
  tags: z.array(z.string()).max(10).default([]),
});

/** GET /api/skills — list the current user's skills. */
export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const skills = await getUserSkills(userId);
    return NextResponse.json(skills);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to list skills' }, { status: 500 });
  }
}

/** POST /api/skills — create a new personal skill. */
export async function POST(request: Request) {
  try {
    const userId = await getUserId(request);
    const body = CreateSkillSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
    }
    const { featureSlot, ...rest } = body.data;
    if (!isFeatureSlot(featureSlot)) {
      return NextResponse.json({ error: `Unknown feature slot: ${featureSlot}` }, { status: 400 });
    }
    const skill = await createSkill(userId, featureSlot, rest);
    return NextResponse.json(skill, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
