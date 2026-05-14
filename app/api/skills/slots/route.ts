import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { getUserId } from '@/src/lib/auth/user';
import {
  getSkillPreferences,
  setSkillPreference,
  FEATURE_SLOTS,
  SLOT_LABELS,
  isFeatureSlot,
} from '@/src/lib/skills';

function readDefaultContent(relativePath: string): string {
  const root = process.cwd();
  const resolved = path.resolve(root, relativePath);
  if (path.relative(root, resolved).startsWith('..') || path.isAbsolute(path.relative(root, resolved))) {
    return '';
  }
  try {
    return fs.readFileSync(resolved, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * GET /api/skills/slots
 *
 * Returns all available feature slots with their labels, system default file,
 * default content, and which skill (if any) the user has activated.
 */
export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const prefs = await getSkillPreferences(userId);

    const slots = (Object.keys(FEATURE_SLOTS) as Array<keyof typeof FEATURE_SLOTS>).map(
      (slot) => ({
        slot,
        label: SLOT_LABELS[slot],
        defaultFile: FEATURE_SLOTS[slot],
        defaultContent: readDefaultContent(FEATURE_SLOTS[slot]),
        activeSkillId: prefs[slot] ?? null,
      }),
    );

    return NextResponse.json(slots);
  } catch {
    return NextResponse.json({ error: 'Failed to load slots' }, { status: 500 });
  }
}

const SetPrefSchema = z.object({
  slot: z.string(),
  /** Pass null to revert to system default. */
  skillId: z.string().nullable(),
});

/**
 * PUT /api/skills/slots — activate (or deactivate) a skill for a feature slot.
 *
 * Pass `skillId: null` to revert to the system default prompt file.
 */
export async function PUT(request: Request) {
  try {
    const userId = await getUserId(request);
    const body = SetPrefSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
    }
    const { slot, skillId } = body.data;
    if (!isFeatureSlot(slot)) {
      return NextResponse.json({ error: `Unknown slot: ${slot}` }, { status: 400 });
    }
    await setSkillPreference(userId, slot, skillId);
    return NextResponse.json({ ok: true, slot, activeSkillId: skillId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
