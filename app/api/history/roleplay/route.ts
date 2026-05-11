import { NextResponse } from 'next/server';
import { readAllProgress, readGlobalRecord } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

const MAX_SESSIONS = 100;

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const { records } = await readAllProgress(userId);
    const global = await readGlobalRecord(userId);
    const all = global ? [global, ...records.filter((r) => r.packageSlug !== global.packageSlug)] : records;

    const roleplaySessions = all
      .flatMap((r) =>
        r.roleplaySessions.map((s) => ({
          sessionId: s.sessionId,
          context: s.context,
          sourceLang: s.sourceLang,
          targetLang: s.targetLang,
          createdAt: s.createdAt,
          messageCount: s.messages.length,
          lastMessageAt: s.messages.length
            ? s.messages[s.messages.length - 1].createdAt
            : s.createdAt,
          messages: s.messages,
          packageSlug: r.packageSlug,
        })),
      )
      .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))
      .slice(0, MAX_SESSIONS);

    return NextResponse.json({ roleplaySessions });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[history/roleplay] Error:', msg);
    return NextResponse.json({ error: 'Failed to fetch roleplay history' }, { status: 500 });
  }
}
