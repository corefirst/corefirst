import { NextResponse } from 'next/server';
import { getUserId } from '@/src/lib/auth/user';
import { providerFor } from '@/src/lib/storage/record';
import type { CFSRS } from '@/src/lib/storage/schema';

// GET /api/vocabulary/due?lang=<targetLang>
// Returns vocabulary items due for review today.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang') ?? '';
    const userId = await getUserId(request);
    const provider = providerFor(userId);
    const srs = await provider.get<CFSRS>('srs', 'user');

    if (!srs?.vocabulary?.length) return NextResponse.json({ items: [] });

    const now = new Date().toISOString();
    const items = srs.vocabulary
      .filter(v => v.nextReviewAt <= now && (!lang || (v.targetLang ?? '') === lang))
      .map(v => ({ token: v.token, meaning: v.meaning, targetLang: v.targetLang ?? '', mastery: v.mastery }));

    return NextResponse.json({ items });
  } catch (err) {
    console.error('[vocabulary/due]', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load vocabulary' }, { status: 500 });
  }
}
