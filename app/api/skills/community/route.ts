import { NextResponse } from 'next/server';
import { getUserId } from '@/src/lib/auth/user';
import { listCommunitySkills, likeSkill, FEATURE_SLOTS, seedSystemSkill, isFeatureSlot } from '@/src/lib/skills';
import type { FeatureSlot } from '@/src/lib/skills';

/**
 * GET /api/skills/community?slot=speech-eval
 *
 * Browse publicly shared skills. Pass ?slot= to filter by feature slot.
 * System skills are lazily seeded on first access.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slot = searchParams.get('slot') ?? undefined;

    const slots = slot && isFeatureSlot(slot)
      ? [slot as FeatureSlot]
      : (Object.keys(FEATURE_SLOTS) as FeatureSlot[]);

    await Promise.all(slots.map(seedSystemSkill));

    const skills = await listCommunitySkills(slot);
    return NextResponse.json(skills);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/skills/community — like a community skill. Body: { skillId } */
export async function POST(request: Request) {
  try {
    await getUserId(request); // require authenticated session
    const { skillId } = await request.json();
    if (!skillId || typeof skillId !== 'string') {
      return NextResponse.json({ error: 'skillId required' }, { status: 400 });
    }
    await likeSkill(skillId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
