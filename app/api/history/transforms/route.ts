import { NextResponse } from 'next/server';
import { readAllProgress, readGlobalRecord } from '@/src/lib/storage';

const MAX_TRANSFORMS = 200;

export async function GET() {
  try {
    const { records } = await readAllProgress();
    const global = await readGlobalRecord();
    const all = global ? [global, ...records.filter((r) => r.packageSlug !== global.packageSlug)] : records;

    const transforms = all
      .flatMap((r) =>
        r.transforms.map((t) => ({
          inputText: t.inputText,
          sourceLang: t.sourceLang,
          targetLang: t.targetLang,
          cfltL1: t.cfltL1,
          cfltL2: t.cfltL2,
          standardL2: t.standardL2,
          createdAt: t.createdAt,
          packageSlug: r.packageSlug,
        })),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, MAX_TRANSFORMS);

    return NextResponse.json({ transforms });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[history/transforms] Error:', msg);
    return NextResponse.json({ error: 'Failed to fetch transform history' }, { status: 500 });
  }
}
