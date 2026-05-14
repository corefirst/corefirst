import { NextResponse } from 'next/server';
import { listPackages } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const packages = await listPackages(userId);
    const items = packages
      .map(({ slug, manifest }) => ({
        slug,
        packageId: manifest.packageId,
        topic: manifest.topic,
        ageGroup: manifest.ageGroup,
        domain: manifest.domain,
        sourceLang: manifest.sourceLang,
        targetLang: manifest.targetLang,
        createdAt: manifest.createdAt,
        lessonCount: manifest.lessons.length,
        scriptCount: manifest.lessons.reduce((acc, l) => acc + l.scripts.length, 0),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return NextResponse.json({ courses: items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[history/courses] Error:', msg);
    return NextResponse.json({ error: 'Failed to fetch course history' }, { status: 500 });
  }
}
