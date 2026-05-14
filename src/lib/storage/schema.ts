// Zod schemas for the on-disk file formats described in docs/package-format.md.
// These are deliberately distinct from src/types/courseware.ts (the LLM
// generation contract) so the LLM prompt can evolve without breaking the
// stored package format.

import { z } from 'zod';

export const PACKAGE_FORMAT_VERSION = '1';

export const PackageScriptSchema = z.object({
  scriptIndex: z.number().int().nonnegative(),
  speaker: z.string(),
  cfltL1: z.string(),
  cfltL2: z.string(),
  standardL2: z.string(),
  // Natural native-language rendering. Optional + default '' so packages
  // produced before this field existed still parse cleanly; the learning-mode
  // demo falls back to standardL2 when empty.
  standardL1: z.string().default(''),
  ssml: z.string(),
  audioFile: z.string().optional(), // e.g. "abc.mp3"
  videoFile: z.string().optional(), // e.g. "def.mp4" (future proofing)
});

export const PackageVocabularySchema = z.object({
  token: z.string(),
  meaning: z.string(),
});

export const PackageLessonSchema = z.object({
  lessonIndex: z.number().int().nonnegative(),
  title: z.string(),
  scenario_desc: z.string(),
  vocabulary_focus: z.array(PackageVocabularySchema),
  visual_generation_prompts: z.array(z.string()),
  scripts: z.array(PackageScriptSchema),
  imageFile: z.string().optional(), // e.g. "ghi.webp"
  videoFile: z.string().optional(), // e.g. "jkl.mp4"
});

export const PackageManifestSchema = z.object({
  packageId: z.string().uuid(),
  slug: z.string(),
  topic: z.string(),
  ageGroup: z.string(),
  domain: z.string(),
  sourceLang: z.string(),
  targetLang: z.string(),
  createdAt: z.string(),
  version: z.literal(PACKAGE_FORMAT_VERSION),
  lessons: z.array(PackageLessonSchema),
});

export type PackageManifest = z.infer<typeof PackageManifestSchema>;
export type PackageLesson = z.infer<typeof PackageLessonSchema>;
export type PackageScript = z.infer<typeof PackageScriptSchema>;

// --- .cfrecord schemas ---

export const AttemptRecordSchema = z.object({
  createdAt: z.string(),
  transcription: z.string(),
  overallScore: z.number(),
  pronunciation: z.number(),
  logicStress: z.number(),
  feedback: z.string(),
  scoreCoreAction: z.number().nullable().default(null),
  scoreCondition: z.number().nullable().default(null),
  scoreSpaceContext: z.number().nullable().default(null),
  scoreTime: z.number().nullable().default(null),
});

export const ScriptProgressSchema = z.object({
  scriptIndex: z.number().int().nonnegative(),
  puzzleCompleted: z.boolean().default(false),
  attempts: z.array(AttemptRecordSchema).default([]),
});

export const LessonProgressSchema = z.object({
  lessonIndex: z.number().int().nonnegative(),
  scripts: z.array(ScriptProgressSchema).default([]),
});

export const VocabularyRecordSchema = z.object({
  token: z.string(),
  meaning: z.string(),
  // The same surface form "go" means different things in English vs German;
  // dedup keys must scope by the language being learned. Optional + default ''
  // for old records that predate this field — readers should treat empty as
  // an unknown language pairing and avoid cross-language collapse.
  targetLang: z.string().default(''),
  mastery: z.number(),
  interval: z.number(),
  easeFactor: z.number(),
  nextReviewAt: z.string(),
  reviewCount: z.number().int(),
  lapseCount: z.number().int(),
  // Reverse link to the script that first introduced this token, so the SR
  // queue UI can offer "back to the source lesson" navigation. Optional for
  // legacy data; new captures always populate it.
  firstSeenIn: z
    .object({
      slug: z.string(),
      lessonIndex: z.number().int().nonnegative(),
      scriptIndex: z.number().int().nonnegative(),
    })
    .optional(),
});

export const TransformRecordSchema = z.object({
  inputText: z.string(),
  sourceLang: z.string(),
  targetLang: z.string(),
  cfltL1: z.string(),
  cfltL2: z.string(),
  standardL2: z.string(),
  createdAt: z.string(),
});

// CRST decomposition shared between user-input analysis and coach-reply
// analysis. Mirrors the runtime schema in app/api/roleplay/route.ts so a
// captured turn can be re-rendered from history identically to the live UI.
const PersistedSlotSchema = z.object({
  content: z.string(),
  is_inferred: z.boolean(),
});

const PersistedCrstSchema = z.object({
  core: PersistedSlotSchema,
  reason: PersistedSlotSchema,
  space: PersistedSlotSchema,
  time: PersistedSlotSchema,
});

const PersistedErrorSchema = z.object({
  type: z.enum(['spelling', 'grammar', 'word_choice', 'word_order']),
  original: z.string(),
  correction: z.string(),
  note: z.string(),
});

const PersistedUserAnalysisSchema = z.object({
  corrected: z.string(),
  errors: z.array(PersistedErrorSchema),
  crst: PersistedCrstSchema,
  standard_l1: z.string(),
});

const PersistedCoachAnalysisSchema = z.object({
  crst: PersistedCrstSchema,
  standard_l1: z.string(),
});

export const RoleplayMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.string(),
  audioFile: z.string().optional(), // User's original recorded voice
  correctedAudioFile: z.string().optional(), // Standard AI voice for the correction
  // All three fields below are optional — only populated when the user had
  // CRST analysis enabled at the time of the turn. Old records (no analysis
  // ever stored) and analysis-disabled new turns parse without these.
  userAnalysis: PersistedUserAnalysisSchema.optional(),
  coachAnalysis: PersistedCoachAnalysisSchema.optional(),
  feedback: z.string().nullable().optional(),
});

export const RoleplaySessionRecordSchema = z.object({
  sessionId: z.string().uuid(),
  context: z.string(),
  sourceLang: z.string(),
  targetLang: z.string(),
  createdAt: z.string(),
  messages: z.array(RoleplayMessageSchema),
});

export const CFStateSchema = z.object({
  packageId: z.string().uuid().nullable(),
  packageSlug: z.string(),
  lastStudiedAt: z.string(),
  lessons: z.array(LessonProgressSchema).default([]),
});

export const CFLogSchema = z.object({
  packageId: z.string().uuid().nullable(),
  packageSlug: z.string(),
  transforms: z.array(TransformRecordSchema).default([]),
  roleplaySessions: z.array(RoleplaySessionRecordSchema).default([]),
  // Attempts are moved to log to prevent progress state bloat
  attempts: z.array(z.object({
    lessonIndex: z.number(),
    scriptIndex: z.number(),
    data: AttemptRecordSchema,
  })).default([]),
});

export const CFSRSSchema = z.object({
  updatedAt: z.string(),
  vocabulary: z.array(VocabularyRecordSchema).default([]),
});

export type CFSRS = z.infer<typeof CFSRSSchema>;

// --- Per-event document schemas ---
//
// Events that are append-only (transforms, attempts, roleplay messages) live
// as individual PouchDB documents. This makes them conflict-free under
// multi-device sync — two devices writing concurrently produce distinct doc
// IDs that merge naturally, instead of two writers racing on the same array
// inside a shared document. ID convention is `<slug>:<type>:<discriminator>`
// so a single course's events enumerate cheaply via listByPrefix.

export const EventDocBaseSchema = z.object({
  type: z.enum(['transform', 'attempt', 'roleplay-session', 'roleplay-msg']),
  slug: z.string(),
  createdAt: z.string(),
});

export const TransformEventSchema = EventDocBaseSchema.extend({
  type: z.literal('transform'),
  data: TransformRecordSchema,
});

export const AttemptEventSchema = EventDocBaseSchema.extend({
  type: z.literal('attempt'),
  lessonIndex: z.number().int().nonnegative(),
  scriptIndex: z.number().int().nonnegative(),
  data: AttemptRecordSchema,
});

export const RoleplaySessionEventSchema = EventDocBaseSchema.extend({
  type: z.literal('roleplay-session'),
  sessionId: z.string(),
  context: z.string(),
  sourceLang: z.string(),
  targetLang: z.string(),
});

export const RoleplayMessageEventSchema = EventDocBaseSchema.extend({
  type: z.literal('roleplay-msg'),
  sessionId: z.string(),
  data: RoleplayMessageSchema,
});

export type TransformEvent = z.infer<typeof TransformEventSchema>;
export type AttemptEvent = z.infer<typeof AttemptEventSchema>;
export type RoleplaySessionEvent = z.infer<typeof RoleplaySessionEventSchema>;
export type RoleplayMessageEvent = z.infer<typeof RoleplayMessageEventSchema>;

export const CFRecordSchema = z.object({
  // packageId is null for the synthetic _global.cfrecord that holds Transform
  // and Roleplay history outside any specific course context. Per-package
  // records always have a UUID. See docs/ai-provider-architecture.md §4.2.
  packageId: z.string().uuid().nullable(),
  packageSlug: z.string(),
  lastStudiedAt: z.string(),
  lessons: z.array(LessonProgressSchema).default([]),
  vocabulary: z.array(VocabularyRecordSchema).default([]),
  transforms: z.array(TransformRecordSchema).default([]),
  roleplaySessions: z.array(RoleplaySessionRecordSchema).default([]),
});

export type CFState = z.infer<typeof CFStateSchema>;
export type CFLog = z.infer<typeof CFLogSchema>;
export type CFRecord = z.infer<typeof CFRecordSchema>;
export type AttemptRecord = z.infer<typeof AttemptRecordSchema>;
export type TransformRecord = z.infer<typeof TransformRecordSchema>;
export type RoleplaySessionRecord = z.infer<typeof RoleplaySessionRecordSchema>;
export type RoleplayMessage = z.infer<typeof RoleplayMessageSchema>;
