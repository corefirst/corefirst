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

// --- per-event readers (return eventId so UI can target deletes) ---

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

/**
 * List all transform events across one slug (or all slugs when slug=null).
 * The `eventId` on each entry is the PouchDB doc ID — clients pass it back to
 * the DELETE endpoint to remove individual entries.
 */
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
    if (!d || d.type !== 'transform' || !d.data) continue;
    out.push({
      eventId: d._id,
      slug: d.slug,
      createdAt: d.createdAt,
      inputText: d.data.inputText,
      sourceLang: d.data.sourceLang,
      targetLang: d.data.targetLang,
      cfltL1: d.data.cfltL1,
      cfltL2: d.data.cfltL2,
      standardL2: d.data.standardL2,
    });
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

/**
 * List all roleplay sessions with their messages. Each message carries an
 * `eventId` for single-message delete, plus the session has a stable
 * `sessionId` for cascade delete / rename.
 */
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
    if (d.type === 'roleplay-session') {
      sessionsBySlug.set(`${d.slug}::${d.sessionId}`, {
        sessionId: d.sessionId,
        slug: d.slug,
        context: d.context,
        sourceLang: d.sourceLang,
        targetLang: d.targetLang,
        createdAt: d.createdAt,
        messages: [],
      });
    } else if (d.type === 'roleplay-msg') {
      const key = `${d.slug}::${d.sessionId}`;
      if (!messagesBySession.has(key)) messagesBySession.set(key, []);
      const data = d.data || {};
      messagesBySession.get(key)!.push({
        eventId: d._id,
        role: data.role,
        content: data.content,
        createdAt: d.createdAt,
        audioFile: data.audioFile,
        correctedAudioFile: data.correctedAudioFile,
        userAnalysis: data.userAnalysis,
        coachAnalysis: data.coachAnalysis,
        feedback: data.feedback ?? null,
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
  out.sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.createdAt ?? a.createdAt;
    const bLast = b.messages[b.messages.length - 1]?.createdAt ?? b.createdAt;
    return bLast.localeCompare(aLast);
  });
  return out;
}

// --- legacy readers (no eventId — backwards-compat shape) ---

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

// --- delete / edit operations ---
//
// Hard delete via PouchDB tombstones. Each device that syncs the database sees
// the `_deleted: true` doc and applies the removal locally, so a delete on one
// device propagates correctly to all others. Operations are idempotent: a
// repeated delete (or a delete that races with another device's delete) is a
// no-op rather than an error.

/**
 * Delete a single history event (transform / roleplay message / attempt). The
 * eventId is the PouchDB `_id` of the event doc, which the history APIs surface
 * to the client precisely for this purpose. Idempotent on missing IDs.
 */
export async function deleteHistoryEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  await providerFor(userId).remove(COL.EVENTS, eventId);
}

/**
 * Delete a roleplay session and all of its messages in one cascade. We find
 * every msg doc by ID prefix (`<slug>:roleplay-msg:<sessionId>:*`) plus the
 * single session metadata doc and tombstone them via bulk_docs. Safe against
 * concurrent writes — anything that arrives after the listByPrefix scan just
 * stays around as a stray, which `readRecord` ignores (no session metadata
 * → not surfaced).
 */
export async function deleteRoleplaySession(
  userId: string,
  slug: string | null,
  sessionId: string,
): Promise<void> {
  const provider = providerFor(userId);
  const slugId = toId(slug);
  const msgPrefix = `${slugId}:roleplay-msg:${sessionId}:`;
  const msgDocs = await provider.listByPrefix(COL.EVENTS, msgPrefix);
  const ids = msgDocs.map((d: any) => d._id).filter(Boolean);
  ids.push(`${slugId}:roleplay-session:${sessionId}`);
  await provider.removeMany(COL.EVENTS, ids);
}

/**
 * Rename a roleplay session's `context` (the human-friendly title). The slug
 * and sessionId never change — those are join keys for the message stream.
 */
export async function renameRoleplaySession(
  userId: string,
  slug: string | null,
  sessionId: string,
  newContext: string,
): Promise<void> {
  const provider = providerFor(userId);
  const slugId = toId(slug);
  const sessionDocId = `${slugId}:roleplay-session:${sessionId}`;
  const trimmed = newContext.trim();
  if (!trimmed) throw new Error('context must not be empty');
  await provider.mutate<any>(COL.EVENTS, sessionDocId, (current) => {
    if (!current) {
      throw new Error(`Roleplay session ${sessionId} not found`);
    }
    return { ...current, context: trimmed };
  });
}

/**
 * Find every event document associated with a slug. Used by `deletePackage`
 * to cascade-clear history when a whole course is removed.
 */
export async function listEventIdsForSlug(
  userId: string,
  slug: string,
): Promise<string[]> {
  const provider = providerFor(userId);
  const docs = await provider.listByPrefix(COL.EVENTS, `${toId(slug)}:`);
  return docs.map((d: any) => d._id).filter(Boolean);
}

export async function removeStateDoc(userId: string, slug: string): Promise<void> {
  await providerFor(userId).remove(COL.STATE, toId(slug));
}

/**
 * Strip `firstSeenIn` references that point at a slug that's being deleted.
 * The vocabulary entries themselves stay — the learner's mastery is real
 * cognitive progress and shouldn't reset just because the source lesson was
 * removed. Only the "back to source" link is cleared so the UI doesn't 404.
 */
export async function orphanVocabularyForSlug(
  userId: string,
  slug: string,
): Promise<void> {
  const provider = providerFor(userId);
  // Bail out BEFORE invoking mutate when no SRS doc exists yet. The previous
  // mutator-returns-null path caused mutate's `{...null, _id, updatedAt}` put
  // to write a doc missing the required `vocabulary` array, corrupting the
  // user's SRS for all future captureVocabulary calls.
  const existing = await provider.get<CFSRS>(COL.SRS, 'user');
  if (!existing) return;
  await provider.mutate<CFSRS>(COL.SRS, 'user', (current) => {
    if (!current) {
      // Another writer deleted the SRS doc between our get() and the mutate
      // read — nothing to orphan. Returning a valid empty SRS keeps the put
      // safe instead of writing a malformed doc.
      return { updatedAt: new Date().toISOString(), vocabulary: [] };
    }
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
