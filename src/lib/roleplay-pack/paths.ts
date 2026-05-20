import * as path from 'path';
import * as fs from 'fs/promises';
import { userRoot, DEFAULT_USER_ID } from '@/src/lib/storage/paths';

function getDataRoot(): string {
  return process.env.COREFIRST_DATA_DIR
    ? path.resolve(process.env.COREFIRST_DATA_DIR)
    : path.join(process.cwd(), 'data');
}

export function sharedPacksDir(): string {
  return path.join(getDataRoot(), 'shared', 'roleplay-packs');
}

export function packsDir(userId: string = DEFAULT_USER_ID): string {
  return path.join(userRoot(userId), 'roleplay-packs');
}

export function packPath(userId: string, packId: string): string {
  return path.join(packsDir(userId), `${packId}.json`);
}

export function sharedPackPath(packId: string): string {
  return path.join(sharedPacksDir(), `${packId}.json`);
}

export async function ensurePacksDir(userId: string = DEFAULT_USER_ID): Promise<void> {
  await fs.mkdir(packsDir(userId), { recursive: true });
}
