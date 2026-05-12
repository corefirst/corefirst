import { NextResponse } from 'next/server';
import { getUserId } from '@/src/lib/auth/user';
import { providerFor } from '@/src/lib/storage/record';
import type { CFSRS } from '@/src/lib/storage/schema';

export interface VocabUsageItem {
  token: string;
  meaning: string;
  targetLang: string;
  mastery: number;
  sessionsUsed: number; // number of unique roleplay sessions where the word appeared
}

export interface VocabUsageResponse {
  total: number;
  usedCount: number;
  unusedCount: number;
  items: VocabUsageItem[]; // sorted by sessionsUsed desc
}

// GET /api/progress/vocab-usage
// Cross-tab analysis: which vocabulary words from the SRS deck have been
// used organically in roleplay conversation, and how many times.
export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const provider = providerFor(userId);

    // 1. Load vocabulary deck
    const srs = await provider.get<CFSRS>('srs', 'user');
    if (!srs?.vocabulary?.length) {
      return NextResponse.json<VocabUsageResponse>({ total: 0, usedCount: 0, unusedCount: 0, items: [] });
    }

    // 2. Load all roleplay user messages across all sessions/courses.
    //    Event IDs follow: <slug>:roleplay-msg:<sessionId>:<discriminator>
    //    listByPrefix with empty prefix returns all events; filter by type in JS.
    //    TODO: materialise a per-session word-usage aggregate at write time to
    //    avoid this full scan when event stores grow large.
    interface StoredEvent {
      _id: string;
      type?: string;
      sessionId?: string;
      data?: { role?: string; content?: string };
    }
    const allEvents = (await provider.listByPrefix('events', '')) as StoredEvent[];
    const userMessages = allEvents
      .filter(ev => ev?.type === 'roleplay-msg' && ev?.data?.role === 'user' && typeof ev?.data?.content === 'string')
      .map(ev => ({
        content: ev.data!.content!.toLowerCase(),
        sessionId: (ev.sessionId ?? ev._id),
      }));

    // 3. For each vocab token, count distinct roleplay sessions that used it
    const items: VocabUsageItem[] = srs.vocabulary.map(v => {
      const needle = v.token.toLowerCase();
      // Use word-boundary-style check: require space or punctuation around token
      // to avoid "plan" matching "explanation". Simple approach: check word presence.
      const sessionsUsed = new Set(
        userMessages
          .filter(m => containsWord(m.content, needle))
          .map(m => m.sessionId),
      ).size;

      return {
        token: v.token,
        meaning: v.meaning,
        targetLang: v.targetLang ?? '',
        mastery: v.mastery ?? 0,
        sessionsUsed,
      };
    });

    items.sort((a, b) => b.sessionsUsed - a.sessionsUsed || b.mastery - a.mastery);

    const usedCount = items.filter(i => i.sessionsUsed > 0).length;

    return NextResponse.json<VocabUsageResponse>(
      { total: items.length, usedCount, unusedCount: items.length - usedCount, items },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (err) {
    console.error('[vocab-usage]', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load vocab usage' }, { status: 500 });
  }
}

// Detect whether a string contains any CJK (Chinese/Japanese/Korean) characters.
// CJK text has no word-space boundaries, so presence check alone is appropriate.
function hasCJK(s: string): boolean {
  return /[㐀-鿿豈-﫿]/.test(s);
}

// Check whether needle appears as a whole word in haystack.
// For CJK tokens: any substring occurrence counts (no word boundaries in CJK text).
// For Latin tokens: require non-alpha characters (or string edge) on both sides,
// preventing "plan" from matching inside "explanation".
export function containsWord(haystack: string, needle: string): boolean {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  if (hasCJK(needle)) return true; // CJK — any occurrence is valid
  const before = idx === 0 || !/[a-z]/i.test(haystack[idx - 1]);
  const after  = idx + needle.length >= haystack.length || !/[a-z]/i.test(haystack[idx + needle.length]);
  return before && after;
}
