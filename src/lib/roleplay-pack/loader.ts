import * as fs from 'fs/promises';
import * as path from 'path';
import { RoleplayPackSchema, type RoleplayPack } from '@/src/types/roleplay-pack';
import {
  packsDir,
  packPath,
  sharedPacksDir,
  sharedPackPath,
  ensurePacksDir,
} from './paths';
import { DEFAULT_USER_ID } from '@/src/lib/storage/paths';

export interface PackEntry {
  pack: RoleplayPack;
  source: 'user' | 'shared';
}

async function readPackFile(file: string): Promise<RoleplayPack> {
  const raw = await fs.readFile(file, 'utf8');
  const parsed = JSON.parse(raw);
  const result = RoleplayPackSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid pack at ${file}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return result.data;
}

async function listDirJson(dir: string): Promise<string[]> {
  try {
    const dirents = await fs.readdir(dir);
    return dirents.filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
}

export async function listPacks(
  userId: string = DEFAULT_USER_ID,
): Promise<PackEntry[]> {
  const entries: PackEntry[] = [];
  const seen = new Set<string>();

  const userFiles = await listDirJson(packsDir(userId));
  for (const name of userFiles) {
    const file = path.join(packsDir(userId), name);
    try {
      const pack = await readPackFile(file);
      if (seen.has(pack.id)) continue;
      entries.push({ pack, source: 'user' });
      seen.add(pack.id);
    } catch (err) {
      console.error(`[roleplay-pack] Skipping ${file}: ${(err as Error).message}`);
    }
  }

  const sharedFiles = await listDirJson(sharedPacksDir());
  for (const name of sharedFiles) {
    const file = path.join(sharedPacksDir(), name);
    try {
      const pack = await readPackFile(file);
      if (seen.has(pack.id)) continue;
      entries.push({ pack, source: 'shared' });
      seen.add(pack.id);
    } catch (err) {
      console.error(`[roleplay-pack] Skipping ${file}: ${(err as Error).message}`);
    }
  }

  return entries;
}

export async function readPack(
  userId: string,
  packId: string,
): Promise<PackEntry | null> {
  const userFile = packPath(userId, packId);
  try {
    const pack = await readPackFile(userFile);
    if (pack.id === packId) return { pack, source: 'user' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.error(`[roleplay-pack] User pack ${packId} unreadable: ${(err as Error).message}`);
    }
  }

  const sharedFile = sharedPackPath(packId);
  try {
    const pack = await readPackFile(sharedFile);
    if (pack.id === packId) return { pack, source: 'shared' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.error(`[roleplay-pack] Shared pack ${packId} unreadable: ${(err as Error).message}`);
    }
  }

  return null;
}

export async function writePack(
  userId: string,
  pack: RoleplayPack,
): Promise<void> {
  const result = RoleplayPackSchema.safeParse(pack);
  if (!result.success) {
    throw new Error(
      `Pack failed validation: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  await ensurePacksDir(userId);
  const file = packPath(userId, result.data.id);
  await fs.writeFile(file, JSON.stringify(result.data, null, 2), 'utf8');
}

export async function deletePack(userId: string, packId: string): Promise<boolean> {
  const file = packPath(userId, packId);
  try {
    await fs.unlink(file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

export function validatePackJSON(input: unknown):
  | { ok: true; pack: RoleplayPack }
  | { ok: false; issues: string[] } {
  const result = RoleplayPackSchema.safeParse(input);
  if (result.success) return { ok: true, pack: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
