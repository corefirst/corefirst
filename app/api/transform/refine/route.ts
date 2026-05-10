import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { transformModel } from '@/src/lib/ai';

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

    const slotsTable = slots
      .map((s) => `- ${s.type.toUpperCase()}: ${sourceLang}="${s.l1}" | ${targetLang}="${s.l2}"`)
      .join('\n');

    const system = `You are a CFLT sentence renderer. The learner has already settled all four CRST slots (Core, Reason, Space, Time). Your job is to (1) compose ONE natural, fluent sentence in the source language and ONE in the target language that uses ALL four slot contents faithfully, AND (2) return the four slots with both languages resolved.

Rules:
- Do NOT add ideas the slots don't contain.
- Do NOT drop any slot — all four must be reflected.
- For each slot, return the slot's \`l1\` VERBATIM (do not rewrite it) and a resolved \`l2\` (in ${targetLang}). If a slot's l2 is empty in the input, translate the l1 into ${targetLang} faithfully and idiomatically — matching the role of the slot (a REASON slot in English typically reads as "because …" or "to …", a TIME slot reads as a time expression, a SPACE slot reads as a place expression, a CORE slot reads as the action/predicate). If l2 is already provided, keep it as-is.
- Preserve each slot's \`type\` exactly as given.
- Source language: ${sourceLang}
- Target language: ${targetLang}`;

    const prompt = `Slots (already confirmed by the learner; empty l2 means it still needs translating):
${slotsTable}

Render the natural sentences AND return the resolved slots.`;

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
