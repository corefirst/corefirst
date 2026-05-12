import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId } from '@/src/lib/auth/user';
import { updateVocabularyMastery } from '@/src/lib/storage/record';

const Schema = z.object({
  token: z.string().min(1),
  targetLang: z.string().default(''),
  knew: z.boolean(), // true = knew it (score 80), false = didn't know (score 0)
});

// POST /api/vocabulary/review
// Records a single vocabulary review result and updates SRS state.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    const { token, targetLang, knew } = parsed.data;
    const userId = await getUserId(request);
    await updateVocabularyMastery(userId, targetLang, [token], knew ? 80 : 0);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[vocabulary/review] Error:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to record review' }, { status: 500 });
  }
}
