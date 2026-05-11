import { NextResponse } from 'next/server';
import { listRoleplaySessions } from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

const MAX_SESSIONS = 100;

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const sessions = await listRoleplaySessions(userId);
    const roleplaySessions = sessions.slice(0, MAX_SESSIONS).map((s) => {
      const last = s.messages[s.messages.length - 1];
      return {
        sessionId: s.sessionId,
        packageSlug: s.slug,
        context: s.context,
        sourceLang: s.sourceLang,
        targetLang: s.targetLang,
        createdAt: s.createdAt,
        messageCount: s.messages.length,
        lastMessageAt: last?.createdAt ?? s.createdAt,
        messages: s.messages,
      };
    });
    return NextResponse.json({ roleplaySessions });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[history/roleplay] Error:', msg);
    return NextResponse.json({ error: 'Failed to fetch roleplay history' }, { status: 500 });
  }
}
