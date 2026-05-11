import { randomBytes } from 'crypto';
import {
  type CFRecord,
  type CFState,
  type CFSRS,
  type AttemptRecord,
  type TransformRecord,
  type RoleplaySessionRecord,
  type RoleplayMessage,
} from './schema';
import { providerFor, PouchDBProvider } from './pouch-provider';
import { listPackages } from './package';
import { DEFAULT_USER_ID, normalizeUserId } from './paths';

// Collections.
//   states  — per-package `CFState`: idempotent progress flags (puzzleCompleted)
//   srs     — single doc `user`: spaced-repetition vocabulary deck
//   events  — append-only per-event documents (transforms, attempts, roleplay)
const COL = {
  STATE: 'states',
  SRS: 'srs',
  EVENTS: 'events',
} as const;

const GLOBAL_SLUG = 'global';

// Normalize a slug to PouchDB-safe form (no leading underscore).
function toId(slug: string | null | undefined): string {
  if (!slug || slug === '_global' || slug === 'global') return GLOBAL_SLUG;
  return slug.startsWith('_') ? slug.substring(1) : slug;
}

function eventId(slug: string, type: string, ...extra: string[]): string {
  const ts = new Date().toISOString();
  // Sort key inside the prefix: ISO time first then a short random nonce so
  // bursts within the same millisecond never collide.
  const rand = randomBytes(3).toString('hex');
  const parts = [toId(slug), type, ...extra, ts, rand];
  return parts.join(':');
}

export class RecordCorruptError extends Error {
  constructor(id: string, cause: string) {
    super(`Record corrupt at ${id}: ${cause}`);
    this.name = 'RecordCorruptError';
  }
}

// Re-export the per-user PouchDB provider getter so consumers that need to
// drop down to db.put/get/list can do so without re-importing internals.
export { providerFor };

/** Legacy export — returns the provider for the default user. */
export const db = providerFor(DEFAULT_USER_ID);

// --- vocabulary (SRS) ---

export async function captureVocabulary(
  userId: string,
  targetLang: string,
  tokens: { token: string; meaning: string }[],
  origin?: { slug: string; lessonIndex: number; scriptIndex: number },
): Promise<void> {
  const provider = providerFor(userId);
  const now = new Date().toISOString();
  const lang = targetLang.trim() || '';

  await provider.mutate<CFSRS>(COL.SRS, 'user', (current) => {
    const srs: CFSRS = current ?? { updatedAt: now, vocabulary: [] };
    let changed = false;
    for (const t of tokens) {
      const key = (v: { token: string; targetLang?: string }) =>
        v.token === t.token && (v.targetLang ?? '') === lang;
      if (!srs.vocabulary.find(key)) {
        srs.vocabulary.push({
          token: t.token,
          meaning: t.meaning,
          targetLang: lang,
          mastery: 0,
          interval: 0,
          easeFactor: 2.5,
          nextReviewAt: now,
          reviewCount: 0,
          lapseCount: 0,
          ...(origin ? { firstSeenIn: origin } : {}),
        });
        changed = true;
      }
    }
    if (changed) srs.updatedAt = now;
    return srs;
  });
}

// --- state (lesson/script progress flags) ---

function emptyState(packageId: string | null, slug: string): CFState {
  return {
    packageId,
    packageSlug: slug,
    lastStudiedAt: new Date().toISOString(),
    lessons: [],
  };
}

export async function completePuzzle(
  userId: string,
  slug: string,
  packageId: string | null,
  lesson: number,
  script: number,
): Promise<void> {
  const provider = providerFor(userId);
  const id = toId(slug);
  await provider.mutate<CFState>(COL.STATE, id, (current) => {
    const state: CFState = current ?? emptyState(packageId, id === GLOBAL_SLUG ? GLOBAL_SLUG : slug);
    state.lastStudiedAt = new Date().toISOString();
    const lessonEntry = ensureLesson(state, lesson);
    const scriptEntry = ensureScript(lessonEntry, script);
    scriptEntry.puzzleCompleted = true;
    return state;
  });
}

// --- append-only events ---

export interface AttemptInput {
  transcription: string;
  overallScore: number;
  pronunciation: number;
  logicStress: number;
  feedback: string;
}

export async function appendAttempt(
  userId: string,
  slug: string | null,
  packageId: string | null,
  lesson: number,
  script: number,
  attempt: AttemptInput,
): Promise<void> {
  const provider = providerFor(userId);
  const slugId = toId(slug);
  const now = new Date().toISOString();

  // 1. Update state (idempotent — mutate() handles concurrent writers).
  await provider.mutate<CFState>(COL.STATE, slugId, (current) => {
    const state: CFState = current ?? emptyState(packageId, slug || GLOBAL_SLUG);
    state.lastStudiedAt = now;
    const lessonEntry = ensureLesson(state, lesson);
    const scriptEntry = ensureScript(lessonEntry, script);
    scriptEntry.puzzleCompleted = true;
    return state;
  });

  // 2. Write the attempt as its own event document. Distinct doc IDs eliminate
  // PouchDB conflicts entirely under multi-writer / multi-device sync.
  const data: AttemptRecord = {
    createdAt: now,
    transcription: attempt.transcription,
    overallScore: attempt.overallScore,
    pronunciation: attempt.pronunciation,
    logicStress: attempt.logicStress,
    feedback: attempt.feedback,
    scoreCoreAction: null,
    scoreCondition: null,
    scoreSpaceContext: null,
    scoreTime: null,
  };
  const id = eventId(slug || GLOBAL_SLUG, 'attempt', String(lesson), String(script));
  await provider.put(COL.EVENTS, id, {
    type: 'attempt',
    slug: slugId,
    lessonIndex: lesson,
    scriptIndex: script,
    createdAt: now,
    data,
  });
}

export async function appendTransform(
  userId: string,
  slug: string | null,
  transform: Omit<TransformRecord, 'createdAt'> & { createdAt?: string },
): Promise<void> {
  const provider = providerFor(userId);
  const slugId = toId(slug);
  const now = new Date().toISOString();
  const data: TransformRecord = {
    ...transform,
    createdAt: transform.createdAt ?? now,
  };
  const id = eventId(slug || GLOBAL_SLUG, 'transform');
  await provider.put(COL.EVENTS, id, {
    type: 'transform',
    slug: slugId,
    createdAt: now,
    data,
  });
}

export interface RoleplayUpsertInput {
  sessionId: string;
  context: string;
  sourceLang: string;
  targetLang: string;
  newMessages: RoleplayMessage[];
}

export async function upsertRoleplaySession(
  userId: string,
  slug: string | null,
  input: RoleplayUpsertInput,
): Promise<void> {
  const provider = providerFor(userId);
  const slugId = toId(slug);
  const now = new Date().toISOString();
  const sessionDocId = `${slugId}:roleplay-session:${input.sessionId}`;

  // The session metadata doc is keyed by sessionId, so concurrent upserts of
  // the same session collapse onto the same doc — mutate() handles any race.
  await provider.mutate<any>(COL.EVENTS, sessionDocId, (current) => ({
    type: 'roleplay-session',
    slug: slugId,
    sessionId: input.sessionId,
    context: input.context,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    createdAt: current?.createdAt ?? now,
  }));

  // Each new message is its own document. No conflicts even if both the user
  // and the assistant write into the same session simultaneously.
  for (const msg of input.newMessages) {
    const id = eventId(slug || GLOBAL_SLUG, 'roleplay-msg', input.sessionId);
    await provider.put(COL.EVENTS, id, {
      type: 'roleplay-msg',
      slug: slugId,
      sessionId: input.sessionId,
      createdAt: msg.createdAt ?? now,
      data: msg,
    });
  }
}

// --- readers ---

export async function readRecord(
  userId: string,
  slug: string,
): Promise<CFRecord | null> {
  const provider = providerFor(userId);
  const id = toId(slug);
  const [state, events] = await Promise.all([
    provider.get<CFState>(COL.STATE, id),
    provider.listByPrefix(COL.EVENTS, `${id}:`),
  ]);

  if (!state && events.length === 0) return null;

  const transforms: TransformRecord[] = [];
  const attemptEvents: { lessonIndex: number; scriptIndex: number; data: AttemptRecord }[] = [];
  const sessionMeta = new Map<string, { context: string; sourceLang: string; targetLang: string; createdAt: string }>();
  const sessionMessages = new Map<string, RoleplayMessage[]>();

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as any;
    switch (e.type) {
      case 'transform':
        transforms.push(e.data);
        break;
      case 'attempt':
        attemptEvents.push({
          lessonIndex: Number(e.lessonIndex),
          scriptIndex: Number(e.scriptIndex),
          data: e.data,
        });
        break;
      case 'roleplay-session':
        sessionMeta.set(e.sessionId, {
          context: e.context,
          sourceLang: e.sourceLang,
          targetLang: e.targetLang,
          createdAt: e.createdAt,
        });
        break;
      case 'roleplay-msg':
        if (!sessionMessages.has(e.sessionId)) sessionMessages.set(e.sessionId, []);
        sessionMessages.get(e.sessionId)!.push(e.data);
        break;
    }
  }

  // Sort timestamps where order matters for the UI.
  transforms.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const list of sessionMessages.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  attemptEvents.sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt));

  // Reconstruct lesson/script structure from state + per-script attempts.
  const lessonIndices = new Set<number>([
    ...(state?.lessons.map((l) => Number(l.lessonIndex)) ?? []),
    ...attemptEvents.map((a) => a.lessonIndex),
  ]);

  const reconstructedLessons = Array.from(lessonIndices).map((lessonIdx) => {
    const sLesson = state?.lessons.find((l) => Number(l.lessonIndex) === lessonIdx);
    const scriptIndices = new Set<number>([
      ...(sLesson?.scripts.map((s) => Number(s.scriptIndex)) ?? []),
      ...attemptEvents.filter((a) => a.lessonIndex === lessonIdx).map((a) => a.scriptIndex),
    ]);
    return {
      lessonIndex: lessonIdx,
      scripts: Array.from(scriptIndices).map((scriptIdx) => {
        const sScript = sLesson?.scripts.find((s) => Number(s.scriptIndex) === scriptIdx);
        const liveAttempts = attemptEvents
          .filter((a) => a.lessonIndex === lessonIdx && a.scriptIndex === scriptIdx)
          .map((a) => a.data);
        const merged = dedupAttempts([...(sScript?.attempts ?? []), ...liveAttempts]);
        return {
          scriptIndex: scriptIdx,
          puzzleCompleted: sScript?.puzzleCompleted ?? merged.length > 0,
          attempts: merged,
        };
      }),
    };
  });

  const roleplaySessions: RoleplaySessionRecord[] = Array.from(sessionMeta.entries()).map(
    ([sessionId, meta]) => ({
      sessionId,
      context: meta.context,
      sourceLang: meta.sourceLang,
      targetLang: meta.targetLang,
      createdAt: meta.createdAt,
      messages: sessionMessages.get(sessionId) ?? [],
    }),
  );

  const activeSlug = id === GLOBAL_SLUG ? GLOBAL_SLUG : (state?.packageSlug ?? slug);

  return {
    packageId: state?.packageId ?? null,
    packageSlug: activeSlug,
    lastStudiedAt: state?.lastStudiedAt ?? new Date().toISOString(),
    vocabulary: [],
    transforms,
    roleplaySessions,
    lessons: reconstructedLessons,
  };
}

export async function readGlobalRecord(userId: string): Promise<CFRecord | null> {
  return readRecord(userId, GLOBAL_SLUG);
}

export async function readAllProgress(
  userId: string = DEFAULT_USER_ID,
): Promise<{ records: CFRecord[]; vocabulary: any[] }> {
  const provider = providerFor(userId);
  const [packageMatches, allStates, allEvents, srs] = await Promise.all([
    listPackages(userId),
    provider.list(COL.STATE) as Promise<any[]>,
    // For dashboard aggregation we still need to know which slugs have events
    // — but the EVENTS collection can be huge. We only pull `_id` keys here
    // and bucket them by slug prefix to discover active slugs cheaply.
    listEventSlugs(provider),
    provider.get<CFSRS>(COL.SRS, 'user'),
  ]);

  const slugs = new Set<string>();
  for (const p of packageMatches) slugs.add(toId(p.slug));
  for (const s of allStates) slugs.add(toId(s._id));
  for (const sl of allEvents) slugs.add(sl);

  const records: CFRecord[] = [];
  await Promise.all(
    Array.from(slugs).map(async (s) => {
      const r = await readRecord(userId, s);
      if (r) records.push(r);
    }),
  );

  return { records, vocabulary: srs?.vocabulary ?? [] };
}

// Cheap discovery of which slugs have at least one event, without pulling all
// event bodies into memory. We rely on `allDocs` returning rows with `id` only
// when `include_docs` is omitted via listByPrefix… but our current adapter
// always includes docs. As a pragmatic compromise, we scan with allDocs and
// strip everything but the prefix before `:`. For multi-thousand-event
// libraries this should later be replaced by a Mango query or a view.
async function listEventSlugs(provider: PouchDBProvider): Promise<string[]> {
  const all = await provider.list(COL.EVENTS);
  const slugs = new Set<string>();
  for (const ev of all) {
    if (!ev || typeof ev !== 'object') continue;
    const idStr: string | undefined = (ev as any)._id;
    if (!idStr) continue;
    const i = idStr.indexOf(':');
    if (i > 0) slugs.add(idStr.substring(0, i));
  }
  return Array.from(slugs);
}

// --- helpers ---

function ensureLesson(state: CFState, lessonIndex: number) {
  let entry = state.lessons.find((l) => Number(l.lessonIndex) === lessonIndex);
  if (!entry) {
    entry = { lessonIndex, scripts: [] };
    state.lessons.push(entry);
  }
  return entry;
}

function ensureScript(
  lesson: { scripts: { scriptIndex: number; puzzleCompleted: boolean; attempts?: AttemptRecord[] }[] },
  scriptIndex: number,
) {
  let entry = lesson.scripts.find((s) => Number(s.scriptIndex) === scriptIndex);
  if (!entry) {
    entry = { scriptIndex, puzzleCompleted: false };
    lesson.scripts.push(entry);
  }
  return entry;
}

function dedupAttempts(attempts: AttemptRecord[]): AttemptRecord[] {
  const seen = new Set<string>();
  const out: AttemptRecord[] = [];
  for (const a of attempts) {
    const key = `${a.createdAt}::${a.transcription}::${a.overallScore}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}
