import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CFLTTransformer } from '@/src/core/transformer';
import { appendTransform } from '@/src/lib/storage';
import { resolveTextContext } from '@/src/lib/ai/request-context';
import { classifyAIError } from '@/src/lib/ai/errors';

const MAX_INPUT_LEN = 8192;

const TransformRequestSchema = z.object({
  text: z.string().min(1).max(MAX_INPUT_LEN),
  sourceLang: z.string().optional(),
  targetLang: z.string().optional(),
  /** UI language — drives the language of LLM-generated rationales so the
   *  learner reads them in their interface language. Independent of source/
   *  target which describe the linguistic content of the transform itself. */
  uiLang: z.string().optional(),
  /** Optional package slug — when present, history is appended to that
   *  package's .cfrecord. Otherwise it goes to _global.cfrecord. */
  packageSlug: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = TransformRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request: text is required (max 8 KB)' },
        { status: 400 },
      );
    }
    const { text, sourceLang, targetLang, uiLang, packageSlug } = parsed.data;

    const { model, userId } = await resolveTextContext('transform', request);
    const transformer = new CFLTTransformer(model);
    const result = await transformer.transform(text, sourceLang, targetLang, uiLang, userId);

    if ('error' in result) {
      console.error('[transform] LLM error:', result.error);
      return NextResponse.json({ error: 'Transformation failed' }, { status: 500 });
    }

    // Phase 1 persistence — non-blocking failure: a write failure must not
    // hide the successful transformation result from the learner.
    try {
      await appendTransform(userId, packageSlug ?? null, {
        inputText: text,
        sourceLang: sourceLang ?? 'Chinese',
        targetLang: targetLang ?? 'English',
        cfltL1: result.cflt_l1,
        cfltL2: result.cflt_l2,
        standardL2: result.standard_l2,
      });
    } catch (err) {
      console.error('[transform] Failed to persist transform record:', (err as Error).message);
    }

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[transform] Error:', msg);
    const code = classifyAIError(error);
    if (code === 'API_KEY_REQUIRED' || code === 'INVALID_API_KEY') {
      return NextResponse.json({ error: code }, { status: 401 });
    }
    return NextResponse.json({ error: 'Transformation failed' }, { status: 500 });
  }
}
