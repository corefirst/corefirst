import * as fs from 'fs/promises';
import * as path from 'path';
import {
  recordsDir,
  DEFAULT_USER_ID,
} from './paths';
import { providerFor } from './pouch-provider';
import { CFStateSchema, CFLogSchema, CFSRSSchema } from './schema';

const COL = {
  STATE: 'states',
  // Legacy "logs" collection (one giant doc per slug) is read here and split
  // into per-event documents under the new EVENTS collection.
  LEGACY_LOG: 'logs',
  EVENTS: 'events',
  SRS: 'srs',
};

/**
 * Migrates pre-PouchDB file-based records and the legacy `logs` collection
 * (which held arrays inside a single doc per slug) into the new per-event
 * EVENTS collection. Idempotent — re-running skips files that have already
 * been backed up to .bak.
 */
export async function migrateFilesToPouch(userId: string = DEFAULT_USER_ID): Promise<void> {
  const dir = recordsDir(userId);
  const provider = providerFor(userId);
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    console.log('[migration] No records directory, skipping file migration.');
  }

  console.log(`[migration] Starting migration for user '${userId}' in ${dir}`);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (file.endsWith('.cfstate')) {
      let slug = path.basename(file, '.cfstate');
      if (slug.startsWith('_')) slug = slug.substring(1);
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        const data = CFStateSchema.parse(JSON.parse(raw));
        await provider.put(COL.STATE, slug, data);
        await backupFile(fullPath);
        console.log(`[migration] Migrated state: ${slug}`);
      } catch (err) {
        console.error(`[migration] Failed state ${file}:`, (err as Error).message);
      }
    } else if (file.endsWith('.cflog')) {
      let slug = path.basename(file, '.cflog');
      if (slug.startsWith('_')) slug = slug.substring(1);
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        const data = CFLogSchema.parse(JSON.parse(raw));
        await splitLegacyLogIntoEvents(provider, slug, data);
        await backupFile(fullPath);
        console.log(`[migration] Migrated log: ${slug}`);
      } catch (err) {
        console.error(`[migration] Failed log ${file}:`, (err as Error).message);
      }
    } else if (file === 'user.cfsrs') {
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        const data = CFSRSSchema.parse(JSON.parse(raw));
        await provider.put(COL.SRS, 'user', data);
        await backupFile(fullPath);
        console.log(`[migration] Migrated SRS`);
      } catch (err) {
        console.error(`[migration] Failed SRS:`, (err as Error).message);
      }
    }
  }

  // Also split any legacy logs doc that was already in PouchDB.
  try {
    const legacyLogs = await provider.list(COL.LEGACY_LOG);
    for (const ld of legacyLogs) {
      if (!ld?._id) continue;
      const parsed = CFLogSchema.safeParse(ld);
      if (!parsed.success) continue;
      await splitLegacyLogIntoEvents(provider, ld._id, parsed.data);
      console.log(`[migration] Split legacy log doc: ${ld._id}`);
    }
  } catch (err) {
    console.error('[migration] Failed legacy log split:', (err as Error).message);
  }

  console.log('[migration] Migration complete.');
}

async function splitLegacyLogIntoEvents(
  provider: ReturnType<typeof providerFor>,
  slug: string,
  log: any,
): Promise<void> {
  const slugId = slug.startsWith('_') ? slug.substring(1) : slug;
  let nonce = 0;
  const eid = (type: string, ts: string, ...extra: string[]) =>
    [slugId, type, ...extra, ts, (nonce++).toString(36).padStart(4, '0')].join(':');

  for (const tr of log.transforms ?? []) {
    const id = eid('transform', tr.createdAt);
    await provider.put(COL.EVENTS, id, {
      type: 'transform',
      slug: slugId,
      createdAt: tr.createdAt,
      data: tr,
    });
  }
  for (const att of log.attempts ?? []) {
    const id = eid('attempt', att.data?.createdAt ?? new Date().toISOString(),
      String(att.lessonIndex), String(att.scriptIndex));
    await provider.put(COL.EVENTS, id, {
      type: 'attempt',
      slug: slugId,
      lessonIndex: att.lessonIndex,
      scriptIndex: att.scriptIndex,
      createdAt: att.data?.createdAt ?? new Date().toISOString(),
      data: att.data,
    });
  }
  for (const sess of log.roleplaySessions ?? []) {
    const sessionId = sess.sessionId;
    const createdAt = sess.createdAt;
    await provider.put(COL.EVENTS, `${slugId}:roleplay-session:${sessionId}`, {
      type: 'roleplay-session',
      slug: slugId,
      sessionId,
      context: sess.context,
      sourceLang: sess.sourceLang,
      targetLang: sess.targetLang,
      createdAt,
    });
    for (const msg of sess.messages ?? []) {
      const id = eid('roleplay-msg', msg.createdAt ?? createdAt, sessionId);
      await provider.put(COL.EVENTS, id, {
        type: 'roleplay-msg',
        slug: slugId,
        sessionId,
        createdAt: msg.createdAt ?? createdAt,
        data: msg,
      });
    }
  }
}

async function backupFile(filePath: string): Promise<void> {
  await fs.rename(filePath, `${filePath}.bak`);
}

if (require.main === module) {
  const userId = process.argv[2] || DEFAULT_USER_ID;
  migrateFilesToPouch(userId)
    .catch(console.error)
    .finally(() => providerFor(userId).closeAll());
}
