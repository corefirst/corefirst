import { NextResponse } from 'next/server';
import { readAllProgress } from '@/src/lib/storage';
import { listPackages } from '@/src/lib/storage/package';
import { getUserId } from '@/src/lib/auth/user';

const ACTIVITY_WINDOW_DAYS = 30;
const TOP_PACKAGES = 5;
const TOP_LANG_PAIRS = 5;
const LEARNING_CURVE_POINTS = 14;

interface DailyActivity {
  date: string;
  attempts: number;
  puzzles: number;
  transforms: number;
  roleplayMsgs: number;
  total: number;
}

interface LearningCurvePoint {
  date: string;
  logic: number;
  pronunciation: number;
  overall: number;
  attempts: number;
}

interface TopPackage {
  slug: string;
  topic: string;
  attempts: number;
  avgScore: number;
  lastStudiedAt: string;
}

interface LangPair {
  pair: string;
  source: string;
  target: string;
  count: number;
}

interface VocabularyDistribution {
  total: number;
  due: number;
  newWords: number;
  learning: number;
  mature: number;
}

interface ProgressResponse {
  summary: {
    totalCourses: number;
    totalSessions: number;
    totalAttempts: number;
    totalPuzzles: number;
    avgScore: number;
    totalTransforms: number;
    totalRoleplaySessions: number;
    totalRoleplayMessages: number;
    totalVocabulary: number;
    studyDays: number;
    currentStreak: number;
    longestStreak: number;
    studyDaysThisMonth: number;
  };
  dailyActivity: DailyActivity[];
  learningCurve: LearningCurvePoint[];
  topPackages: TopPackage[];
  languagePairs: LangPair[];
  vocabulary: VocabularyDistribution;
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const [{ records, vocabulary: allVocabulary }, packageMatches] = await Promise.all([
      readAllProgress(userId),
      listPackages(userId)
    ]);

    const slugToTopic = new Map(packageMatches.map((p) => [p.slug, p.manifest.topic]));

    const allScripts = records.flatMap((r) => r.lessons.flatMap((l) => l.scripts));
    const allAttempts = allScripts.flatMap((s) => s.attempts);
    const completedPuzzles = allScripts.filter((s) => s.puzzleCompleted);
const allTransforms = records.flatMap((r) => r.transforms);
const allRoleplayMessages = records.flatMap((r) =>
  r.roleplaySessions.flatMap((s) => s.messages),
);

const totalAttempts = allAttempts.length;
const totalPuzzles = completedPuzzles.length;
const totalTransforms = allTransforms.length;
const totalRoleplaySessions = records.reduce((acc, r) => acc + r.roleplaySessions.length, 0);
const totalRoleplayMessages = allRoleplayMessages.length;
const totalVocabulary = allVocabulary.length;

// totalCourses: actual distinct course packages that have activity
const totalCourses = records.filter(
  (r) => r.packageSlug !== 'global' && r.lessons.some((l) => l.scripts.some((s) => s.puzzleCompleted || s.attempts.length > 0)),
).length;

    const totalSessions = records.filter((r) =>
      r.lessons.some((l) => l.scripts.some((s) => s.puzzleCompleted || s.attempts.length > 0)),
    ).length;

    const avgScore =
      totalAttempts === 0 ? 0 : Math.round(average(allAttempts.map((a) => a.overallScore)));

    // --- Activity by day (UTC date keys for stability) ---
    const activityMap = new Map<string, DailyActivity>();
    const touchDay = (iso: string, kind: 'attempts' | 'puzzles' | 'transforms' | 'roleplayMsgs') => {
      const key = isoDate(iso);
      if (!key) return;
      const entry =
        activityMap.get(key) ??
        { date: key, attempts: 0, puzzles: 0, transforms: 0, roleplayMsgs: 0, total: 0 };
      entry[kind] += 1;
      entry.total += 1;
      activityMap.set(key, entry);
    };

    for (const a of allAttempts) touchDay(a.createdAt, 'attempts');
    // Note: We don't have a separate createdAt for puzzle completion yet, 
    // so for now we use the first attempt date or skip if no attempts.
    // In the future, completePuzzle API should accept/store a timestamp.
    for (const s of completedPuzzles) {
       if (s.attempts.length > 0) {
         touchDay(s.attempts[0].createdAt, 'puzzles');
       }
    }
    for (const t of allTransforms) touchDay(t.createdAt, 'transforms');
    for (const m of allRoleplayMessages) touchDay(m.createdAt, 'roleplayMsgs');

    // Fill the trailing window with zero days so the heatmap renders contiguously.
    const today = startOfUtcDay(new Date());
    const dailyActivity: DailyActivity[] = [];
    for (let i = ACTIVITY_WINDOW_DAYS - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setUTCDate(today.getUTCDate() - i);
      const key = day.toISOString().slice(0, 10);
      dailyActivity.push(
        activityMap.get(key) ?? { date: key, attempts: 0, puzzles: 0, transforms: 0, roleplayMsgs: 0, total: 0 },
      );
    }

    // --- Streaks across ALL activity days ---
    const studyDaySet = new Set(activityMap.keys());
    const studyDays = studyDaySet.size;
    const { currentStreak, longestStreak } = computeStreaks(studyDaySet, today);
    const studyDaysThisMonth = Array.from(studyDaySet).filter((d) => {
      const dt = new Date(d + 'T00:00:00.000Z');
      return (
        dt.getUTCFullYear() === today.getUTCFullYear() && dt.getUTCMonth() === today.getUTCMonth()
      );
    }).length;

    // --- Learning curve by day, last LEARNING_CURVE_POINTS active days ---
    const curveBuckets = new Map<string, { logic: number[]; pronunciation: number[]; overall: number[] }>();
    for (const a of allAttempts) {
      const key = isoDate(a.createdAt);
      if (!key) continue;
      const bucket = curveBuckets.get(key) ?? { logic: [], pronunciation: [], overall: [] };
      bucket.logic.push(a.logicStress);
      bucket.pronunciation.push(a.pronunciation);
      bucket.overall.push(a.overallScore);
      curveBuckets.set(key, bucket);
    }
    const learningCurve: LearningCurvePoint[] = Array.from(curveBuckets.entries())
      .map(([date, b]) => ({
        date,
        logic: Math.round(average(b.logic)),
        pronunciation: Math.round(average(b.pronunciation)),
        overall: Math.round(average(b.overall)),
        attempts: b.overall.length,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-LEARNING_CURVE_POINTS);

    // --- Top packages by attempt count ---
    const topPackages: TopPackage[] = records
      .filter((r) => r.packageSlug !== 'global')
      .map((r) => {
        const attempts = r.lessons.flatMap((l) => l.scripts.flatMap((s) => s.attempts));
        return {
          slug: r.packageSlug,
          topic: slugToTopic.get(r.packageSlug) ?? r.packageSlug,
          attempts: attempts.length,
          avgScore:
            attempts.length === 0 ? 0 : Math.round(average(attempts.map((a) => a.overallScore))),
          lastStudiedAt: r.lastStudiedAt,
        };
      })
      .filter((p) => p.attempts > 0)
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, TOP_PACKAGES);

    // --- Language pair frequency (transforms are the main signal) ---
    const langCount = new Map<string, LangPair>();
    for (const t of allTransforms) {
      const pair = `${t.sourceLang}→${t.targetLang}`;
      const entry = langCount.get(pair) ?? {
        pair,
        source: t.sourceLang,
        target: t.targetLang,
        count: 0,
      };
      entry.count += 1;
      langCount.set(pair, entry);
    }
    const languagePairs = Array.from(langCount.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_LANG_PAIRS);

    // --- Vocabulary SRS distribution ---
    const nowIso = new Date().toISOString();
    const vocabulary: VocabularyDistribution = {
      total: totalVocabulary,
      due: allVocabulary.filter((v) => v.nextReviewAt <= nowIso).length,
      // Convention: reviewCount === 0 → new, mastery >= 0.8 → mature, else learning.
      newWords: allVocabulary.filter((v) => v.reviewCount === 0).length,
      learning: allVocabulary.filter((v) => v.reviewCount > 0 && v.mastery < 0.8).length,
      mature: allVocabulary.filter((v) => v.mastery >= 0.8).length,
    };

    const response: ProgressResponse = {
      summary: {
        totalCourses,
        totalSessions,
        totalAttempts,
        totalPuzzles,
        avgScore,
        totalTransforms,
        totalRoleplaySessions,
        totalRoleplayMessages,
        totalVocabulary,
        studyDays,
        currentStreak,
        longestStreak,
        studyDaysThisMonth,
      },
      dailyActivity,
      learningCurve,
      topPackages,
      languagePairs,
      vocabulary,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[progress] Error:', msg);
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
  }
}

function average(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function isoDate(iso: string): string | null {
  // Defensive: some legacy records may have malformed timestamps.
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function computeStreaks(
  days: Set<string>,
  today: Date,
): { currentStreak: number; longestStreak: number } {
  if (days.size === 0) return { currentStreak: 0, longestStreak: 0 };

  // Current streak: consecutive days ending at today, or yesterday if today is empty
  // (so the user doesn't lose their streak before the day is over).
  let cursor = new Date(today);
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let currentStreak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    currentStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  // Longest streak: scan sorted unique days for max consecutive run.
  const sorted = Array.from(days).sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const d of sorted) {
    const cur = new Date(d + 'T00:00:00.000Z');
    if (prev && (cur.getTime() - prev.getTime()) === 86400000) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = cur;
  }

  return { currentStreak, longestStreak: longest };
}
