import * as path from 'path';
import * as fs from 'fs/promises';

// All data is partitioned by userId so that multiple learners sharing a
// machine (or sharing a server) don't merge their records, SRS state, or
// course library. The default 'local' userId preserves single-user behavior
// when no auth context is wired up — local dev keeps just working.
export const DEFAULT_USER_ID = 'local';

// userId must be filesystem- and PouchDB-safe. Anything outside ascii letters,
// digits, hyphen, underscore gets normalized; empty after normalization falls
// back to DEFAULT_USER_ID. Enforced here so callers can't accidentally write
// records under a path-traversal id like '../other-user'.
export function normalizeUserId(userId: string | null | undefined): string {
  if (!userId) return DEFAULT_USER_ID;
  const cleaned = userId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return cleaned || DEFAULT_USER_ID;
}

function getDataRoot(): string {
  return process.env.COREFIRST_DATA_DIR
    ? path.resolve(process.env.COREFIRST_DATA_DIR)
    : path.join(process.cwd(), 'data');
}

export function userRoot(userId: string = DEFAULT_USER_ID): string {
  return path.join(getDataRoot(), 'users', normalizeUserId(userId));
}

export function packagesDir(userId: string = DEFAULT_USER_ID): string {
  return path.join(userRoot(userId), 'packages');
}

export function recordsDir(userId: string = DEFAULT_USER_ID): string {
  return path.join(userRoot(userId), 'records');
}

export function mediaDir(userId: string = DEFAULT_USER_ID): string {
  return path.join(userRoot(userId), 'media');
}

export function packagePath(userId: string, slug: string): string {
  return path.join(packagesDir(userId), `${slug}.corefirst`);
}

export function manifestPath(userId: string, slug: string): string {
  return path.join(packagesDir(userId), `${slug}.json`);
}

export function recordPath(userId: string, slug: string): string {
  return path.join(recordsDir(userId), `${slug}.cfstate`);
}

export function logPath(userId: string, slug: string): string {
  return path.join(recordsDir(userId), `${slug}.cflog`);
}

export function globalLogPath(userId: string): string {
  return path.join(recordsDir(userId), `global.cflog`);
}

export function globalSRSPath(userId: string): string {
  return path.join(recordsDir(userId), `user.cfsrs`);
}

export function mediaPath(userId: string, filename: string): string {
  return path.join(mediaDir(userId), filename);
}

export function globalRecordPath(userId: string): string {
  return path.join(recordsDir(userId), `global.cfrecord`);
}

/**
 * Slug formula: `{industry}-{targetLang}-{ageGroup}-{topicSlug}`.
 *
 * We always include the topic now — without it, two different courses with
 * the same industry/language/age silently overwrote each other (the previous
 * formula's worst bug). When the topic contains only non-ASCII characters
 * (e.g. Chinese topic for a Chinese learner), ASCII-stripping would empty it
 * and the collision returns, so we fall back to a short hash of the original
 * topic to keep the slug unique.
 */
export function buildSlug(
  industry: string,
  targetLang: string,
  ageGroup: string,
  topic: string,
): string {
  const baseParts = [industry, targetLang, ageGroup]
    .map(asciiSlug)
    .filter(Boolean);
  const topicSlug = asciiSlug(topic);
  const topicPart = topicSlug || `t${shortHash(topic)}`;
  return [...baseParts, topicPart].join('-');
}

function asciiSlug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function shortHash(s: string): string {
  // FNV-1a 32-bit — cheap, non-cryptographic, plenty for slug disambiguation.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Shared (cross-user) media pool for deterministic content: TTS audio and generated images. */
export function sharedMediaDir(): string {
  return path.join(getDataRoot(), 'shared', 'media');
}

/** Full path to a file in the shared media pool. */
export function sharedMediaPath(filename: string): string {
  return path.join(sharedMediaDir(), filename);
}

/** Returns true for personal voice recordings that must stay per-user. */
export function isPersonalRecording(filename: string): boolean {
  return filename.endsWith('.webm');
}

export async function ensureDataDirs(userId: string = DEFAULT_USER_ID): Promise<void> {
  await fs.mkdir(packagesDir(userId), { recursive: true });
  await fs.mkdir(recordsDir(userId), { recursive: true });
  await fs.mkdir(mediaDir(userId), { recursive: true });
  await fs.mkdir(sharedMediaDir(), { recursive: true });
}
