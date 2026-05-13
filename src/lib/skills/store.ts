import * as path from 'path';
import * as fs from 'fs';
import { mkdirSync } from 'fs';
// @ts-ignore
import PouchDBNode from 'pouchdb-node';
import { providerFor } from '@/src/lib/storage/pouch-provider';
import { loadPrompt, validatePromptTemplate } from '@/src/lib/prompts/loader';
import { FEATURE_SLOTS, type FeatureSlot } from './feature-slots';
import type { SkillDoc, SkillWithId, SkillPrefsDoc } from './types';

// Re-use the canonical data-root path from paths.ts so COREFIRST_DATA_DIR
// is respected consistently across the codebase.
import { sharedMediaDir } from '@/src/lib/storage/paths';

const COL_SKILLS = 'skills';
const COL_PREFS = 'skill_prefs';
const PREFS_DOC_ID = 'active';

const COMMUNITY_DB_RETRY_LIMIT = 10;

// ── Community (shared) DB ─────────────────────────────────────────────────────

function communityDbPath(): string {
  // sharedMediaDir() → data/shared/media — step up one level for skills.
  const sharedDir = path.dirname(sharedMediaDir());
  const dir = path.join(sharedDir, 'skills');
  mkdirSync(dir, { recursive: true });
  return path.join(dir, 'community');
}

let _communityDb: any = null;
function communityDb(): any {
  if (!_communityDb) _communityDb = new PouchDBNode(communityDbPath());
  return _communityDb;
}

async function communityGet(id: string): Promise<SkillWithId | null> {
  try {
    return await communityDb().get(id) as SkillWithId;
  } catch (err: any) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function communityPut(id: string, data: SkillDoc, retries = 0): Promise<void> {
  const existing: any = await communityDb().get(id).catch(() => null);
  try {
    await communityDb().put({
      ...data,
      _id: id,
      _rev: existing?._rev,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err.status === 409 && retries < COMMUNITY_DB_RETRY_LIMIT) {
      return communityPut(id, data, retries + 1);
    }
    throw err;
  }
}

// ── System skill seeding ──────────────────────────────────────────────────────

export function systemSkillId(slot: FeatureSlot): string {
  return `skill:system:${slot}`;
}

function detectVars(content: string): Array<{ key: string; label: string }> {
  const found = [...content.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)];
  const unique = [...new Set(found.map((m) => m[1]))];
  return unique.map((key) => ({ key, label: key.toLowerCase().replace(/_/g, ' ') }));
}

/**
 * Ensure the system skill for `slot` exists in the community catalog.
 * Idempotent — skips if already present and content matches.
 */
export async function seedSystemSkill(slot: FeatureSlot): Promise<SkillWithId> {
  const id = systemSkillId(slot);
  const existing = await communityGet(id);
  const file = FEATURE_SLOTS[slot];
  const content = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');

  if (existing && existing.content === content) return existing;

  const doc: SkillDoc = {
    featureSlot: slot,
    name: slot.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    description: `System default skill for ${slot}.`,
    content,
    vars: detectVars(content),
    tags: ['system'],
    isSystem: true,
    authorId: 'system',
    visibility: 'public',
    forkOf: null,
    likes: 0,
    forks: 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await communityPut(id, doc);
  return { ...doc, _id: id };
}

// ── User skill CRUD ───────────────────────────────────────────────────────────

function newSkillId(): string {
  return `skill:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createSkill(
  userId: string,
  slot: FeatureSlot,
  data: { name: string; description: string; content: string; tags?: string[] },
): Promise<SkillWithId> {
  const validation = validatePromptTemplate(data.content);
  if (validation.malformed.length > 0) {
    throw new Error(`Template syntax error: ${validation.malformed[0]}`);
  }
  const id = newSkillId();
  const doc: SkillDoc = {
    featureSlot: slot,
    name: data.name,
    description: data.description,
    content: data.content,
    vars: detectVars(data.content),
    tags: data.tags ?? [],
    isSystem: false,
    authorId: userId,
    visibility: 'private',
    forkOf: null,
    likes: 0,
    forks: 0,
    createdAt: new Date().toISOString(),
  };
  await providerFor(userId).put(COL_SKILLS, id, doc);
  return { ...doc, _id: id };
}

export async function updateSkill(
  userId: string,
  skillId: string,
  patch: Partial<Pick<SkillDoc, 'name' | 'description' | 'content' | 'tags'>>,
): Promise<SkillWithId> {
  const existing = await providerFor(userId).get<SkillDoc>(COL_SKILLS, skillId);
  if (!existing) throw new Error('Skill not found');
  if (existing.authorId !== userId) throw new Error('Forbidden');

  if (patch.content) {
    const validation = validatePromptTemplate(patch.content);
    if (validation.malformed.length > 0) {
      throw new Error(`Template syntax error: ${validation.malformed[0]}`);
    }
  }

  const updated: SkillDoc = {
    ...existing,
    ...patch,
    vars: patch.content ? detectVars(patch.content) : existing.vars,
    updatedAt: new Date().toISOString(),
  };
  await providerFor(userId).put(COL_SKILLS, skillId, updated);
  return { ...updated, _id: skillId };
}

export async function deleteSkill(userId: string, skillId: string): Promise<void> {
  const existing = await providerFor(userId).get<SkillDoc>(COL_SKILLS, skillId);
  if (!existing) return;
  if (existing.authorId !== userId) throw new Error('Forbidden');
  await providerFor(userId).remove(COL_SKILLS, skillId);
  // If the skill was published, retract it from the community catalog too.
  if (existing.visibility === 'public') {
    const community = await communityGet(skillId);
    if (community) await communityDb().remove(community);
  }
}

export async function getUserSkills(userId: string): Promise<SkillWithId[]> {
  const docs = await providerFor(userId).list(COL_SKILLS);
  return docs.filter(Boolean).map((d: any) => ({ ...d, _id: d._id }));
}

export async function getSkillById(userId: string, skillId: string): Promise<SkillWithId | null> {
  const own = await providerFor(userId).get<SkillDoc>(COL_SKILLS, skillId);
  if (own) return { ...own, _id: skillId };
  return communityGet(skillId);
}

// ── Publish / Fork ────────────────────────────────────────────────────────────

export async function publishSkill(userId: string, skillId: string): Promise<SkillWithId> {
  const skill = await providerFor(userId).get<SkillDoc>(COL_SKILLS, skillId);
  if (!skill) throw new Error('Skill not found');
  if (skill.authorId !== userId) throw new Error('Forbidden');

  const published: SkillDoc = { ...skill, visibility: 'public' };
  await providerFor(userId).put(COL_SKILLS, skillId, published);
  await communityPut(skillId, published);
  // forks counter increments at fork-time only, not at publish-time.
  return { ...published, _id: skillId };
}

export async function forkSkill(userId: string, sourceSkillId: string): Promise<SkillWithId> {
  const source = await communityGet(sourceSkillId);
  if (!source) throw new Error('Source skill not found in community');

  const id = newSkillId();
  const { _id: _ignored, ...sourceFields } = source as SkillWithId;
  const forked: SkillDoc = {
    ...sourceFields,
    name: `${source.name} (fork)`,
    isSystem: false,
    authorId: userId,
    visibility: 'private',
    forkOf: sourceSkillId,
    likes: 0,
    forks: 0,
    createdAt: new Date().toISOString(),
    updatedAt: undefined,
  };
  await providerFor(userId).put(COL_SKILLS, id, forked);
  await incrementCommunityCounter(sourceSkillId, 'forks');
  return { ...forked, _id: id };
}

async function incrementCommunityCounter(id: string, field: 'likes' | 'forks'): Promise<void> {
  const doc = await communityGet(id);
  if (!doc) return;
  await communityPut(id, { ...doc, [field]: (doc[field] ?? 0) + 1 });
}

export async function likeSkill(skillId: string): Promise<void> {
  await incrementCommunityCounter(skillId, 'likes');
}

// ── Community browse ──────────────────────────────────────────────────────────

export async function listCommunitySkills(slot?: string): Promise<SkillWithId[]> {
  const result = await communityDb().allDocs({ include_docs: true });
  const docs: SkillWithId[] = result.rows
    .map((r: any) => r.doc)
    .filter((d: any) => d && !d._id.startsWith('_'));
  return slot ? docs.filter((d) => d.featureSlot === slot) : docs;
}

// ── User preferences ──────────────────────────────────────────────────────────

export async function getSkillPreferences(userId: string): Promise<Record<string, string>> {
  const doc = await providerFor(userId).get<SkillPrefsDoc>(COL_PREFS, PREFS_DOC_ID);
  return doc?.prefs ?? {};
}

export async function setSkillPreference(
  userId: string,
  slot: string,
  skillId: string | null,
): Promise<void> {
  await providerFor(userId).mutate<SkillPrefsDoc>(COL_PREFS, PREFS_DOC_ID, (current) => {
    const prefs = { ...(current?.prefs ?? {}) };
    if (skillId === null) {
      delete prefs[slot];
    } else {
      prefs[slot] = skillId;
    }
    return { prefs };
  });
}
