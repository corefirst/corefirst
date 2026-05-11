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
import { calculateNextReview, scoreToQuality } from './srs';

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

/** Normalize a slug to PouchDB-safe form (no leading underscore). */
function toId(slug: string | null | undefined): string {
  if (!slug || slug === '_global' || slug === 'global') return GLOBAL_SLUG;
  return slug.startsWith('_') ? slug.substring(1) : slug;
}

/** Generate a unique ID with a sortable timestamp and random nonce. */
function eventId(slug: string, type: string, ...extra: string[]): string {
  const ts = new Date().toISOString();
  const rand = randomBytes(3).toString('hex');
  const parts = [toId(slug), type, ...extra, ts, rand];
  return parts.join(':');
}

/** Robustly extract a field from a document that might be nested or flat. */
function getVal(doc: any, key: string, fallback: any = undefined): any {
  if (!doc) return fallback;
  if (doc.data && typeof doc.data === 'object' && key in doc.data) return doc.data[key];
  if (key in doc) return doc[key];
  return fallback;
}

/** Detect event type from body or ID prefix. */
function getDetectedType(doc: any): string | null {
  if (doc.type) return doc.type;
  const id = doc._id || '';
  const parts = id.split(':');
  return parts.length > 1 ? parts[1] : null;
}

export class RecordCorruptError extends Error {
  constructor(id: string, cause: string) {
    super(`Record corrupt at ${id}: ${cause}`);
    this.name = 'RecordCorruptError';
  }
}

export { providerFor };
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

export async function updateVocabularyMastery(
  userId: string,
  targetLang: string,
  token: string,
  score: number,
): Promise<void> {
  const provider = providerFor(userId);
  const lang = targetLang.trim() || '';
  const quality = scoreToQuality(score);

  // Check before mutate: returning null from a mutate callback writes a
  // corrupted doc (same bug that was fixed in orphanVocabularyForSlug).
  const existing = await provider.get<CFSRS>(COL.SRS, 'user');
  if (!existing?.vocabulary) return;

  await provider.mutate<CFSRS>(COL.SRS, 'user', (current) => {
    if (!current || !current.vocabulary) return current ?? { vocabulary: [], updatedAt: new Date().toISOString() };
    
    const entry = current.vocabulary.find(
      (v) => v.token === token && (v.targetLang ?? '') === lang,
    );
    if (entry) {
      const next = calculateNextReview(quality, {
        interval: entry.interval || 0,
        easeFactor: entry.easeFactor || 2.5,
        reviewCount: entry.reviewCount || 0,
      });
      entry.interval = next.interval;
      entry.easeFactor = next.easeFactor;
      entry.reviewCount = next.reviewCount;
      entry.nextReviewAt = next.nextReviewAt;
      entry.mastery = Math.min(100, Math.round((entry.reviewCount / 10) * 100));
      if (quality < 3) entry.lapseCount = (entry.lapseCount || 0) + 1;
      current.updatedAt = new Date().toISOString();
    }
    return current;
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
  scoreCoreAction?: number;
  scoreCondition?: number;
  scoreSpaceContext?: number;
  scoreTime?: number;
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

  await provider.mutate<CFState>(COL.STATE, slugId, (current) => {
    const state: CFState = current ?? emptyState(packageId, slug || GLOBAL_SLUG);
    state.lastStudiedAt = now;
    const lessonEntry = ensureLesson(state, lesson);
    const scriptEntry = ensureScript(lessonEntry, script);
    scriptEntry.puzzleCompleted = true;
    return state;
  });

  const data: AttemptRecord = {
    createdAt: now,
    transcription: attempt.transcription,
    overallScore: attempt.overallScore,
    pronunciation: attempt.pronunciation,
    logicStress: attempt.logicStress,
    feedback: attempt.feedback,
    scoreCoreAction: attempt.scoreCoreAction ?? null,
    scoreCondition: attempt.scoreCondition ?? null,
    scoreSpaceContext: attempt.scoreSpaceContext ?? null,
    scoreTime: attempt.scoreTime ?? null,
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

  await provider.mutate<any>(COL.EVENTS, sessionDocId, (current) => ({
    type: 'roleplay-session',
    slug: slugId,
    sessionId: input.sessionId,
    context: input.context,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    createdAt: current?.createdAt ?? now,
  }));

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

// --- per-event readers ---

export interface TransformHistoryEntry {
  eventId: string;
  slug: string;
  createdAt: string;
  inputText: string;
  sourceLang: string;
  targetLang: string;
  cfltL1: string;
  cfltL2: string;
  standardL2: string;
}

export interface RoleplayMessageEntry {
  eventId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  audioFile?: string;
  correctedAudioFile?: string;
  userAnalysis?: any;
  coachAnalysis?: any;
  feedback?: string | null;
}

export interface RoleplaySessionEntry {
  sessionId: string;
  slug: string;
  context: string;
  sourceLang: string;
  targetLang: string;
  createdAt: string;
  messages: RoleplayMessageEntry[];
}

export async function listTransformEvents(
  userId: string,
  slug?: string | null,
): Promise<TransformHistoryEntry[]> {
  const provider = providerFor(userId);
  const docs = slug
    ? await provider.listByPrefix(COL.EVENTS, `${toId(slug)}:transform:`)
    : await provider.list(COL.EVENTS);
  
  const out: TransformHistoryEntry[] = [];
  for (const d of docs) {
    if (!d) continue;
    const detectedType = getDetectedType(d);
    const inputText = getVal(d, 'inputText');
    if (detectedType !== 'transform' || !inputText) continue;

    out.push({
      eventId: d._id,
      slug: d.slug || d._id.split(':')[0],
      createdAt: d.createdAt || getVal(d, 'createdAt') || new Date(0).toISOString(),
      inputText,
      sourceLang: getVal(d, 'sourceLang', 'Chinese'),
      targetLang: getVal(d, 'targetLang', 'English'),
      cfltL1: getVal(d, 'cfltL1', ''),
      cfltL2: getVal(d, 'cfltL2', ''),
      standardL2: getVal(d, 'standardL2', ''),
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listRoleplaySessions(
  userId: string,
  slug?: string | null,
): Promise<RoleplaySessionEntry[]> {
  const provider = providerFor(userId);
  const docs = slug
    ? await provider.listByPrefix(COL.EVENTS, `${toId(slug)}:`)
    : await provider.list(COL.EVENTS);

  const sessionsBySlug = new Map<string, RoleplaySessionEntry>();
  const messagesBySession = new Map<string, RoleplayMessageEntry[]>();

  for (const d of docs) {
    if (!d) continue;
    const detectedType = getDetectedType(d);
    const parts = d._id.split(':');

    if (detectedType === 'roleplay-session') {
      const sId = d.sessionId || parts[2];
      const sSlug = d.slug || parts[0];
      sessionsBySlug.set(`${sSlug}::${sId}`, {
        sessionId: sId,
        slug: sSlug,
        context: d.context || '',
        sourceLang: d.sourceLang || 'Chinese',
        targetLang: d.targetLang || 'English',
        createdAt: d.createdAt || new Date(0).toISOString(),
        messages: [],
      });
    } else if (detectedType === 'roleplay-msg') {
      const sId = d.sessionId || parts[2];
      const sSlug = d.slug || parts[0];
      if (!sId) continue;
      
      const key = `${sSlug}::${sId}`;
      if (!messagesBySession.has(key)) messagesBySession.set(key, []);
      
      messagesBySession.get(key)!.push({
        eventId: d._id,
        role: getVal(d, 'role', 'assistant'),
        content: getVal(d, 'content', ''),
        createdAt: d.createdAt || getVal(d, 'createdAt') || new Date(0).toISOString(),
        audioFile: getVal(d, 'audioFile'),
        correctedAudioFile: getVal(d, 'correctedAudioFile'),
        userAnalysis: getVal(d, 'userAnalysis'),
        coachAnalysis: getVal(d, 'coachAnalysis'),
        feedback: getVal(d, 'feedback', null),
      });
    }
  }

  const out: RoleplaySessionEntry[] = [];
  for (const [key, session] of sessionsBySlug) {
    const msgs = (messagesBySession.get(key) ?? []).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    session.messages = msgs;
    out.push(session);
  }
  return out.sort((a, b) => {
    const aTime = a.messages[a.messages.length - 1]?.createdAt || a.createdAt;
    const bTime = b.messages[b.messages.length - 1]?.createdAt || b.createdAt;
    return bTime.localeCompare(aTime);
  });
}

// --- record reconstruction ---

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
    if (!ev) continue;
    const type = getDetectedType(ev);
    const data = ev.data || ev;
    const parts = ev._id.split(':');

    switch (type) {
      case 'transform':
        transforms.push(data);
        break;
      case 'attempt':
        attemptEvents.push({
          lessonIndex: Number(ev.lessonIndex ?? parts[2] ?? -1),
          scriptIndex: Number(ev.scriptIndex ?? parts[3] ?? -1),
          data,
        });
        break;
      case 'roleplay-session':
        sessionMeta.set(ev.sessionId || parts[2], {
          context: ev.context || '',
          sourceLang: ev.sourceLang || 'Chinese',
          targetLang: ev.targetLang || 'English',
          createdAt: ev.createdAt || new Date(0).toISOString(),
        });
        break;
      case 'roleplay-msg':
        const sId = ev.sessionId || parts[2];
        if (sId) {
          if (!sessionMessages.has(sId)) sessionMessages.set(sId, []);
          sessionMessages.get(sId)!.push(data);
        }
        break;
    }
  }

  // Sort logic
  const sortTime = (a: any, b: any) => (a.createdAt || '').localeCompare(b.createdAt || '');
  transforms.sort(sortTime);
  for (const list of sessionMessages.values()) list.sort(sortTime);
  attemptEvents.sort((a, b) => sortTime(a.data, b.data));

  const lessonIndices = new Set<number>([
    ...(state?.lessons.map((l) => Number(l.lessonIndex)) ?? []),
    ...attemptEvents.map((a) => a.lessonIndex),
  ]);

  const reconstructedLessons = Array.from(lessonIndices).filter(idx => idx >= 0).map((lessonIdx) => {
    const sLesson = state?.lessons.find((l) => Number(l.lessonIndex) === lessonIdx);
    const scriptIndices = new Set<number>([
      ...(sLesson?.scripts.map((s) => Number(s.scriptIndex)) ?? []),
      ...attemptEvents.filter((a) => a.lessonIndex === lessonIdx).map((a) => a.scriptIndex),
    ]);
    return {
      lessonIndex: lessonIdx,
      scripts: Array.from(scriptIndices).filter(idx => idx >= 0).map((scriptIdx) => {
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

  return {
    packageId: state?.packageId ?? null,
    packageSlug: id === GLOBAL_SLUG ? GLOBAL_SLUG : (state?.packageSlug ?? slug),
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

// --- delete / edit operations ---

export async function deleteHistoryEvent(userId: string, eventId: string): Promise<void> {
  await providerFor(userId).remove(COL.EVENTS, eventId);
}

export async function deleteRoleplaySession(userId: string, slug: string | null, sessionId: string): Promise<void> {
  const provider = providerFor(userId);
  const slugId = toId(slug);
  const ids = (await provider.listByPrefix(COL.EVENTS, `${slugId}:roleplay-msg:${sessionId}:`))
    .map((d: any) => d._id)
    .filter(Boolean);
  ids.push(`${slugId}:roleplay-session:${sessionId}`);
  await provider.removeMany(COL.EVENTS, ids);
}

export async function renameRoleplaySession(userId: string, slug: string | null, sessionId: string, newContext: string): Promise<void> {
  const provider = providerFor(userId);
  const sessionDocId = `${toId(slug)}:roleplay-session:${sessionId}`;
  await provider.mutate<any>(COL.EVENTS, sessionDocId, (current) => {
    if (!current) throw new Error(`Roleplay session ${sessionId} not found`);
    return { ...current, context: newContext.trim() || 'Untitled' };
  });
}

export async function listEventIdsForSlug(userId: string, slug: string): Promise<string[]> {
  const docs = await providerFor(userId).listByPrefix(COL.EVENTS, `${toId(slug)}:`);
  return docs.map((d: any) => d._id).filter(Boolean);
}

export async function removeStateDoc(userId: string, slug: string): Promise<void> {
  await providerFor(userId).remove(COL.STATE, toId(slug));
}

export async function orphanVocabularyForSlug(userId: string, slug: string): Promise<void> {
  const provider = providerFor(userId);
  const existing = await provider.get<CFSRS>(COL.SRS, 'user');
  if (!existing) return;
  await provider.mutate<CFSRS>(COL.SRS, 'user', (current) => {
    if (!current) return { updatedAt: new Date().toISOString(), vocabulary: [] };
    const slugId = toId(slug);
    let changed = false;
    for (const entry of current.vocabulary) {
      if (entry.firstSeenIn && toId(entry.firstSeenIn.slug) === slugId) {
        delete (entry as any).firstSeenIn;
        changed = true;
      }
    }
    if (changed) current.updatedAt = new Date().toISOString();
    return current;
  });
}

export async function readAllProgress(userId: string = DEFAULT_USER_ID): Promise<{ records: CFRecord[]; vocabulary: any[] }> {
  const provider = providerFor(userId);
  const [packageMatches, allStates, allEvents, srs] = await Promise.all([
    listPackages(userId),
    provider.list(COL.STATE) as Promise<any[]>,
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
      try {
        const r = await readRecord(userId, s);
        if (r) records.push(r);
      } catch (e) {
        console.error(`[readAllProgress] Failed for slug ${s}:`, e);
      }
    }),
  );

  return { records, vocabulary: srs?.vocabulary ?? [] };
}

async function listEventSlugs(provider: PouchDBProvider): Promise<string[]> {
  const all = await provider.list(COL.EVENTS);
  const slugs = new Set<string>();
  for (const ev of all) {
    if (!ev?._id) continue;
    const i = ev._id.indexOf(':');
    if (i > 0) slugs.add(ev._id.substring(0, i));
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

function ensureScript(lesson: any, scriptIndex: number) {
  let entry = lesson.scripts.find((s: any) => Number(s.scriptIndex) === scriptIndex);
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
    const key = `${a.createdAt}::${a.transcription}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.sort((x, y) => (x.createdAt || '').localeCompare(y.createdAt || ''));
}
