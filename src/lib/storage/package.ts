import * as fs from 'fs/promises';
import * as path from 'path';
import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import { PackageManifestSchema, type PackageManifest } from './schema';
import {
  ensureDataDirs,
  packagePath,
  manifestPath,
  packagesDir,
  mediaPath,
  DEFAULT_USER_ID,
} from './paths';

export class PackageNotFoundError extends Error {
  constructor(slug: string) {
    super(`Package "${slug}" not found`);
    this.name = 'PackageNotFoundError';
  }
}

export class PackageCorruptError extends Error {
  constructor(message: string) {
    super(`Package corrupt: ${message}`);
    this.name = 'PackageCorruptError';
  }
}

export interface WritePackageInput {
  manifest: PackageManifest;
  /** key: `media/[hash].mp3` or `media/[hash].webp` */
  audio: Map<string, Uint8Array>;
  /** key: `media/[hash].webp` (optional) */
  images: Map<string, Uint8Array>;
  /** If true, also generate a portable .corefirst ZIP package. */
  saveFull?: boolean;
}

export interface WritePackageResult {
  packageId: string;
  slug: string;
  manifestPath: string;
  fullPath?: string;
}

/**
 * Resolve a base slug to one that does not collide with an existing package
 * (owned by a different packageId). If the slug is free, returns it. If the
 * slug is taken by the SAME packageId (re-saving the same logical course),
 * returns it (overwrite is intended). If it's taken by a DIFFERENT packageId,
 * appends `-2`, `-3`, … until free.
 *
 * Without this, two courses with the same industry/lang/age silently
 * overwrote each other on the filesystem.
 */
export async function resolveUniqueSlug(
  userId: string,
  baseSlug: string,
  packageId: string,
): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
    const mPath = manifestPath(userId, candidate);
    try {
      const raw = await fs.readFile(mPath, 'utf-8');
      const existing = PackageManifestSchema.parse(JSON.parse(raw));
      if (existing.packageId === packageId) return candidate;
      // Different package owns this slug — try the next suffix.
      continue;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return candidate;
      // Corrupt manifest: pretend it's taken, move on. Don't overwrite.
      continue;
    }
  }
  throw new Error(`Cannot resolve unique slug for "${baseSlug}": too many collisions`);
}

export async function writePackage(
  userId: string,
  input: WritePackageInput,
): Promise<WritePackageResult> {
  const validated = PackageManifestSchema.parse(input.manifest);
  await ensureDataDirs(userId);

  // 1. Always save the Lite manifest — fast, simple, the source of truth.
  const mPath = manifestPath(userId, validated.slug);
  await fs.writeFile(mPath, JSON.stringify(validated, null, 2));

  let fullPath: string | undefined;

  // 2. Optionally save the Full version (ZIP) for sharing/export.
  if (input.saveFull) {
    const target = packagePath(userId, validated.slug);
    const tmp = `${target}.tmp`;
    const entries: Record<string, Uint8Array> = {
      'manifest.json': strToU8(JSON.stringify(validated, null, 2)),
    };
    for (const [k, v] of input.audio) entries[k] = v;
    for (const [k, v] of input.images) entries[k] = v;
    const buffer = await zipBuffer(entries);
    await fs.writeFile(tmp, buffer);
    await fs.rename(tmp, target);
    fullPath = target;
  }

  return {
    packageId: validated.packageId,
    slug: validated.slug,
    manifestPath: mPath,
    fullPath,
  };
}

export async function readPackageManifest(
  userId: string,
  slug: string,
): Promise<PackageManifest> {
  // 1. Try Lite manifest first
  const mPath = manifestPath(userId, slug);
  try {
    const raw = await fs.readFile(mPath, 'utf-8');
    return PackageManifestSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // 2. Fall back to Full ZIP
  const file = packagePath(userId, slug);
  const buf = await readFileOrThrow(file, slug);
  const entries = await unzipBuffer(buf);
  const raw = entries['manifest.json'];
  if (!raw) throw new PackageCorruptError(`manifest.json missing from ${slug}.corefirst`);
  try {
    return PackageManifestSchema.parse(JSON.parse(strFromU8(raw)));
  } catch (e) {
    throw new PackageCorruptError(`manifest.json invalid: ${(e as Error).message}`);
  }
}

export async function readPackageAudio(
  userId: string,
  slug: string,
  lesson: number,
  script: number,
): Promise<Uint8Array> {
  const manifest = await readPackageManifest(userId, slug);
  const l = manifest.lessons[lesson];
  const s = l?.scripts[script];

  if (s?.audioFile) {
    const filename = s.audioFile;
    // 1. Try this user's media pool
    try {
      return new Uint8Array(await fs.readFile(mediaPath(userId, filename)));
    } catch {
      // 2. Fall back to the package's embedded media (only if a full ZIP exists)
      try {
        const buf = await readFileOrThrow(packagePath(userId, slug), slug);
        const entries = await unzipBuffer(buf);
        const data = entries[`media/${filename}`];
        if (data) return data;
      } catch {
        /* ZIP doesn't exist — Lite-only package */
      }
    }
  }

  // 3. Legacy V1 fallback (index-based audio path inside a ZIP)
  const file = packagePath(userId, slug);
  const buf = await readFileOrThrow(file, slug);
  const entries = await unzipBuffer(buf);
  const key = `audio/l${lesson}s${script}.mp3`;
  const data = entries[key];
  if (!data) throw new PackageCorruptError(`audio entry "${key}" missing from ${slug}.corefirst`);
  return data;
}

export async function readPackageImage(
  userId: string,
  slug: string,
  lesson: number,
): Promise<Uint8Array | null> {
  const manifest = await readPackageManifest(userId, slug);
  const l = manifest.lessons[lesson];

  if (l?.imageFile) {
    const filename = l.imageFile;
    try {
      return new Uint8Array(await fs.readFile(mediaPath(userId, filename)));
    } catch {
      try {
        const buf = await readFileOrThrow(packagePath(userId, slug), slug);
        const entries = await unzipBuffer(buf);
        const data = entries[`media/${filename}`];
        if (data) return data;
      } catch {
        /* no ZIP */
      }
    }
  }

  // Legacy V1 fallback
  try {
    const file = packagePath(userId, slug);
    const buf = await readFileOrThrow(file, slug);
    const entries = await unzipBuffer(buf);
    return entries[`images/l${lesson}.webp`] ?? null;
  } catch {
    return null;
  }
}

export async function listPackages(
  userId: string = DEFAULT_USER_ID,
): Promise<{ slug: string; manifest: PackageManifest }[]> {
  await ensureDataDirs(userId);
  let dirents: string[] = [];
  try {
    dirents = await fs.readdir(packagesDir(userId));
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const out: { slug: string; manifest: PackageManifest }[] = [];

  // Prefer JSON manifests (cheap to read)
  for (const name of dirents) {
    if (name.endsWith('.json')) {
      const slug = path.basename(name, '.json');
      try {
        const manifest = await readPackageManifest(userId, slug);
        out.push({ slug, manifest });
        seen.add(slug);
      } catch (err) {
        console.error(`[storage] Skipping corrupt manifest ${slug}:`, (err as Error).message);
      }
    }
  }

  // Fall back to standalone .corefirst ZIPs (no JSON sibling)
  for (const name of dirents) {
    if (name.endsWith('.corefirst')) {
      const slug = path.basename(name, '.corefirst');
      if (seen.has(slug)) continue;
      try {
        const manifest = await readPackageManifest(userId, slug);
        out.push({ slug, manifest });
        seen.add(slug);
      } catch (err) {
        console.error(`[storage] Skipping corrupt package ${slug}:`, (err as Error).message);
      }
    }
  }

  return out;
}

/**
 * Sweep orphaned media files for a user. A media file is orphaned when no
 * package manifest references it. Returns the list of deleted filenames.
 *
 * Use cases:
 *   - After re-generating a course (old hashes drop out of the new manifest)
 *   - Periodic janitor pass to reclaim disk
 *
 * Safe to call concurrently with reads (we only delete files that no manifest
 * names; a manifest written between scan and delete just keeps its files).
 */
export async function pruneOrphanMedia(
  userId: string = DEFAULT_USER_ID,
): Promise<string[]> {
  await ensureDataDirs(userId);
  const referenced = await collectReferencedMedia(userId);
  let onDisk: string[] = [];
  try {
    onDisk = await fs.readdir(path.join(packagesDir(userId), '..', 'media'));
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const name of onDisk) {
    if (referenced.has(name)) continue;
    try {
      await fs.unlink(mediaPath(userId, name));
      removed.push(name);
    } catch (err) {
      console.error(`[storage] Failed to remove orphan media ${name}:`, (err as Error).message);
    }
  }
  return removed;
}

async function collectReferencedMedia(userId: string): Promise<Set<string>> {
  const refs = new Set<string>();
  const packages = await listPackages(userId);
  for (const { manifest } of packages) {
    for (const lesson of manifest.lessons) {
      if (lesson.imageFile) refs.add(lesson.imageFile);
      if (lesson.videoFile) refs.add(lesson.videoFile);
      for (const script of lesson.scripts) {
        if (script.audioFile) refs.add(script.audioFile);
        if (script.videoFile) refs.add(script.videoFile);
      }
    }
  }
  return refs;
}

async function readFileOrThrow(file: string, slug: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await fs.readFile(file));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PackageNotFoundError(slug);
    }
    throw err;
  }
}

function zipBuffer(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // Audio/image entries are already compressed; level 0 (store-only) saves
    // CPU at write time without meaningfully increasing on-disk size.
    zip(entries, { level: 0 }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function unzipBuffer(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(buf, (err, entries) => {
      if (err) reject(err);
      else resolve(entries);
    });
  });
}
