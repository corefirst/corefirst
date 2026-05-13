import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { transformModel } from '@/src/lib/ai';
import { loadSkill } from '@/src/lib/skills';
import { getUserId } from '@/src/lib/auth/user';

// Refines the standard sentence after the user has filled (picked or typed)
// any inferred CRST slots. We hand the LLM the four confirmed slot contents
// (in both source/target language) plus the language pair, and ask it to
// render natural-sounding standard sentences. Cheaper and more constrained
// than re-running the full transform; no per-slot re-inference needed since
// slot semantics are already settled at this point.

const SLOT_TYPES = ['core', 'reason', 'space', 'time'] as const;

const SlotSchema = z.object({
  type: z.enum(SLOT_TYPES),
  l1: z.string(),
  l2: z.string(),
});

const RefineRequestSchema = z.object({
  sourceLang: z.string().min(1).max(64),
  targetLang: z.string().min(1).max(64),
  uiLang: z.string().optional(),
  slots: z.array(SlotSchema).length(4),
});

const RefineResponseSchema = z.object({
  standard_l1: z.string(),
  standard_l2: z.string(),
  slots: z.array(SlotSchema).length(4),
});

export async function POST(request: Request) {
  try {
    const parsed = RefineRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { sourceLang, targetLang, slots } = parsed.data;
    const userId = await getUserId(request);

    const slotsTable = slots
      .map((s) => `- ${s.type.toUpperCase()}: ${sourceLang}="${s.l1}" | ${targetLang}="${s.l2}"`)
      .join('\n');

    const system = await loadSkill('sentence-refine', {
      SOURCE_LANG: sourceLang,
      TARGET_LANG: targetLang,
    }, userId);

    const prompt = await loadSkill('sentence-refine-user', { SLOTS_TABLE: slotsTable }, userId);

    const { object } = await generateObject({
      model: transformModel,
      schema: RefineResponseSchema,
      system,
      prompt,
    });

    return NextResponse.json(object);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[transform/refine] Error:', msg);
    return NextResponse.json({ error: 'Refine failed' }, { status: 500 });
  }
}
