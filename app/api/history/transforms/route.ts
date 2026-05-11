import { NextResponse } from 'next/server';
import { listTransformEvents } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

const MAX_TRANSFORMS = 200;

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const events = await listTransformEvents(userId);
    const transforms = events.slice(0, MAX_TRANSFORMS).map((e) => ({
      eventId: e.eventId,
      packageSlug: e.slug,
      inputText: e.inputText,
      sourceLang: e.sourceLang,
      targetLang: e.targetLang,
      cfltL1: e.cfltL1,
      cfltL2: e.cfltL2,
      standardL2: e.standardL2,
      createdAt: e.createdAt,
    }));
    return NextResponse.json({ transforms });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[history/transforms] Error:', msg);
    return NextResponse.json({ error: 'Failed to fetch transform history' }, { status: 500 });
  }
}
