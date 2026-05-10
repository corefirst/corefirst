import {
  CFStateSchema,
  CFLogSchema,
  CFSRSSchema,
  type CFRecord,
  type CFState,
  type CFLog,
  type CFSRS,
  type AttemptRecord,
  type TransformRecord,
  type RoleplaySessionRecord,
  type RoleplayMessage,
} from './schema';
import { PouchDBProvider } from './pouch-provider';
import { listPackages } from './package';

// Initialize global storage instance
export const db = new PouchDBProvider();

// Collection names definitions
const COL = {
  STATE: 'states',
  LOG: 'logs',
  SRS: 'srs'
};

const GLOBAL_ID = 'global';

/**
 * Normalizes a slug to be used as a PouchDB ID.
 * PouchDB doesn't allow IDs starting with '_'.
 */
function toId(slug: string | null | undefined): string {
  if (!slug || slug === '_global' || slug === 'global') return GLOBAL_ID;
  return slug.startsWith('_') ? slug.substring(1) : slug;
}

export class RecordCorruptError extends Error {
  constructor(id: string, cause: string) {
    super(`Record corrupt at ${id}: ${cause}`);
    this.name = 'RecordCorruptError';
  }
}

// --- core read/write helpers ---

async function readSrs(): Promise<CFSRS | null> {
  return await db.get<CFSRS>(COL.SRS, 'user');
}

/**
 * Capture vocabulary tokens into the SRS system.
 */
export async function captureVocabulary(tokens: { token: string; meaning: string }[]): Promise<void> {
  const srs = (await readSrs()) ?? { updatedAt: new Date().toISOString(), vocabulary: [] };
  const now = new Date().toISOString();
  
  let changed = false;
  for (const t of tokens) {
    if (!srs.vocabulary.find(v => v.token === t.token)) {
      srs.vocabulary.push({
        ...t,
        mastery: 0,
        interval: 0,
        easeFactor: 2.5,
        nextReviewAt: now,
        reviewCount: 0,
        lapseCount: 0
      });
      changed = true;
    }
  }
  
  if (changed) {
    srs.updatedAt = now;
    await db.put(COL.SRS, 'user', srs);
  }
}

function emptyState(packageId: string | null, slug: string): CFState {
  return {
    packageId,
    packageSlug: slug,
    lastStudiedAt: new Date().toISOString(),
    lessons: [],
  };
}

function emptyLog(packageId: string | null, slug: string): CFLog {
  return {
    packageId,
    packageSlug: slug,
    transforms: [],
    roleplaySessions: [],
    attempts: [],
  };
}

// --- public API ---

export async function readRecord(slug: string): Promise<CFRecord | null> {
  const id = toId(slug);
  const [state, log] = await Promise.all([
    db.get<CFState>(COL.STATE, id),
    db.get<CFLog>(COL.LOG, id)
  ]);
  
  if (!state && !log) return null;
  
  // Force consistency: packageSlug must be 'global' if id is 'global'
  const activeSlug = (id === GLOBAL_ID) ? GLOBAL_ID : (state?.packageSlug ?? log?.packageSlug ?? id);
  const flatAttempts = log?.attempts ?? [];
  
  const lessonIndices = new Set([
    ...(state?.lessons.map(l => Number(l.lessonIndex)) ?? []),
    ...flatAttempts.map(a => Number(a.lessonIndex))
  ]);

  const reconstructedLessons = Array.from(lessonIndices).map(lessonIdx => {
    const sLesson = state?.lessons.find(l => Number(l.lessonIndex) === lessonIdx);
    const scriptIndices = new Set([
      ...(sLesson?.scripts.map(s => Number(s.scriptIndex)) ?? []),
      ...flatAttempts.filter(a => Number(a.lessonIndex) === lessonIdx).map(a => Number(a.scriptIndex))
    ]);

    return {
      lessonIndex: lessonIdx,
      scripts: Array.from(scriptIndices).map(scriptIdx => {
        const sScript = sLesson?.scripts.find(s => Number(s.scriptIndex) === scriptIdx);
        const recoveredAttempts = [
          ...(sScript?.attempts ?? []),
          ...flatAttempts
            .filter(a => Number(a.lessonIndex) === lessonIdx && Number(a.scriptIndex) === scriptIdx)
            .map(a => a.data)
        ];

        return {
          scriptIndex: scriptIdx,
          puzzleCompleted: sScript?.puzzleCompleted ?? recoveredAttempts.length > 0,
          attempts: recoveredAttempts
        };
      })
    };
  });

  return {
    packageId: state?.packageId ?? log?.packageId ?? null,
    packageSlug: activeSlug,
    lastStudiedAt: state?.lastStudiedAt ?? new Date().toISOString(),
    vocabulary: [], 
    transforms: log?.transforms ?? [],
    roleplaySessions: log?.roleplaySessions ?? [],
    lessons: reconstructedLessons
  };
}

export async function readGlobalRecord(): Promise<CFRecord | null> {
  return await readRecord(GLOBAL_ID);
}

export interface AttemptInput {
  transcription: string;
  overallScore: number;
  pronunciation: number;
  logicStress: number;
  feedback: string;
}

export async function appendAttempt(
  slug: string | null,
  packageId: string | null,
  lesson: number,
  script: number,
  attempt: AttemptInput,
): Promise<void> {
  const id = toId(slug);
  const effectiveSlug = slug || 'global';

  // 1. Update State
  const state = (await db.get<CFState>(COL.STATE, id)) ?? emptyState(packageId, effectiveSlug);
  state.lastStudiedAt = new Date().toISOString();
  const lessonEntry = ensureLesson(state, lesson);
  const scriptEntry = ensureScript(lessonEntry, script);
  scriptEntry.puzzleCompleted = true;
  await db.put(COL.STATE, id, state);

  // 2. Append Log
  const log = (await db.get<CFLog>(COL.LOG, id)) ?? emptyLog(packageId, effectiveSlug);
  log.attempts.push({
    lessonIndex: lesson,
    scriptIndex: script,
    data: {
      createdAt: new Date().toISOString(),
      ...attempt,
      scoreCoreAction: null,
      scoreCondition: null,
      scoreSpaceContext: null,
      scoreTime: null,
    }
  });
  await db.put(COL.LOG, id, log);
}

export async function completePuzzle(
  slug: string,
  packageId: string,
  lesson: number,
  script: number,
): Promise<void> {
  const id = toId(slug);
  const state = (await db.get<CFState>(COL.STATE, id)) ?? emptyState(packageId, slug);
  state.lastStudiedAt = new Date().toISOString();
  const lessonEntry = ensureLesson(state, lesson);
  const scriptEntry = ensureScript(lessonEntry, script);
  scriptEntry.puzzleCompleted = true;
  await db.put(COL.STATE, id, state);
}

export async function appendTransform(
  slug: string | null,
  transform: Omit<TransformRecord, 'createdAt'> & { createdAt?: string },
): Promise<void> {
  const id = toId(slug);
  const log = (await db.get<CFLog>(COL.LOG, id)) ?? emptyLog(null, slug || 'global');
  log.transforms.push({
    ...transform,
    createdAt: transform.createdAt ?? new Date().toISOString(),
  });
  await db.put(COL.LOG, id, log);
}

export interface RoleplayUpsertInput {
  sessionId: string;
  context: string;
  sourceLang: string;
  targetLang: string;
  newMessages: RoleplayMessage[];
}

export async function upsertRoleplaySession(
  slug: string | null,
  input: RoleplayUpsertInput,
): Promise<void> {
  const id = toId(slug);
  const log = (await db.get<CFLog>(COL.LOG, id)) ?? emptyLog(null, slug || 'global');
  const existing = log.roleplaySessions.find((s) => s.sessionId === input.sessionId);
  
  if (existing) {
    existing.messages.push(...input.newMessages);
    existing.context = input.context;
  } else {
    log.roleplaySessions.push({
      sessionId: input.sessionId,
      context: input.context,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      createdAt: new Date().toISOString(),
      messages: [...input.newMessages],
    });
  }
  await db.put(COL.LOG, id, log);
}

export async function readAllProgress(): Promise<{
  records: CFRecord[];
  vocabulary: any[];
}> {
  const [packageMatches, srs] = await Promise.all([
    listPackages(),
    readSrs()
  ]);
  
  const records: CFRecord[] = [];
  const seen = new Set<string>();

  const tryAdd = async (slug: string) => {
    const id = toId(slug);
    if (seen.has(id)) return;
    const r = await readRecord(id);
    if (r) {
      records.push(r);
      seen.add(id);
    }
  };

  for (const { slug } of packageMatches) await tryAdd(slug);
  const allStates = await db.list(COL.STATE) as any[];
  for (const state of allStates) await tryAdd(state._id);
  const allLogs = await db.list(COL.LOG) as any[];
  for (const log of allLogs) await tryAdd(log._id);

  if (!seen.has(GLOBAL_ID)) {
    const globalRecord = await readGlobalRecord();
    if (globalRecord) records.push(globalRecord);
  }

  return { records, vocabulary: srs?.vocabulary ?? [] };
}

// --- helpers ---

function ensureLesson(record: CFState, lessonIndex: number) {
  let entry = record.lessons.find((l) => Number(l.lessonIndex) === lessonIndex);
  if (!entry) {
    entry = { lessonIndex, scripts: [] };
    record.lessons.push(entry);
  }
  return entry;
}

function ensureScript(lesson: { scripts: { scriptIndex: number; puzzleCompleted: boolean }[] }, scriptIndex: number) {
  let entry = lesson.scripts.find((s) => Number(s.scriptIndex) === scriptIndex);
  if (!entry) {
    entry = {
      scriptIndex,
      puzzleCompleted: false,
    };
    lesson.scripts.push(entry);
  }
  return entry;
}
