import { NextResponse } from 'next/server';
import { getUserId } from '@/src/lib/auth/user';
import { providerFor } from '@/src/lib/storage/record';
import type { CFState } from '@/src/lib/storage/schema';

// GET /api/progress/puzzles?slug=<packageSlug>
// Returns completed puzzle IDs for a course package, matching the client-side
// key format "puzzle-{lessonIndex}-{scriptIndex}" used in completedPuzzles Set.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  if (!slug) return NextResponse.json({ completed: [] });

  try {
    const userId = await getUserId(request);
    const provider = providerFor(userId);
    const id = slug.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const state = await provider.get<CFState>('states', id);

    if (!state?.lessons) return NextResponse.json({ completed: [] });

    const completed: string[] = [];
    state.lessons.forEach((lesson, li) => {
      lesson.scripts?.forEach((script, si) => {
        if (script.puzzleCompleted) completed.push(`puzzle-${li}-${si}`);
      });
    });

    return NextResponse.json({ completed });
  } catch {
    return NextResponse.json({ completed: [] });
  }
}
