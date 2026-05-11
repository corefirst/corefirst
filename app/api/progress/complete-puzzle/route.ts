import { NextResponse } from 'next/server';
import { z } from 'zod';
import { completePuzzle } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

const CompletePuzzleSchema = z.object({
  packageId: z.string().nullable().optional(),
  packageSlug: z.string().min(1),
  lessonIndex: z.union([z.number(), z.string()]).transform(v => Number(v)),
  scriptIndex: z.union([z.number(), z.string()]).transform(v => Number(v)),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CompletePuzzleSchema.safeParse(body);
    
    if (!parsed.success) {
      console.warn('[complete-puzzle] Validation failed:', parsed.error.flatten());
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { packageSlug, packageId, lessonIndex, scriptIndex } = parsed.data;

    const userId = await getUserId(request);
    await completePuzzle(userId, packageSlug, packageId ?? null, lessonIndex, scriptIndex);

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[complete-puzzle] Error:', msg);
    return NextResponse.json({ error: 'Failed to save puzzle progress' }, { status: 500 });
  }
}
