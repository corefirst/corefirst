import * as fs from 'fs/promises';
import * as path from 'path';
import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import { PackageManifestSchema, type PackageManifest } from './schema';
import { ensureDataDirs, packagePath, manifestPath, packagesDir, mediaPath } from './paths';

export class PackageNotFoundError extends Error {
  constructor(slug: string) {
    super(`Package "${slug}" not found in ${packagesDir()}`);
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

export async function writePackage(input: WritePackageInput): Promise<WritePackageResult> {
  const validated = PackageManifestSchema.parse(input.manifest);

  await ensureDataDirs();
  
  // 1. Always save the Lite version (JSON manifest) - the source of truth for local dev
  const mPath = manifestPath(validated.slug);
  await fs.writeFile(mPath, JSON.stringify(validated, null, 2));

  let fullPath: string | undefined;
  
  // 2. Optionally save the Full version (ZIP) - for sharing/export
  if (input.saveFull) {
    const target = packagePath(validated.slug);
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
    fullPath 
  };
}

export async function readPackageManifest(slug: string): Promise<PackageManifest> {
  // 1. Try Lite version (JSON) first - fastest
  const mPath = manifestPath(slug);
  try {
    const raw = await fs.readFile(mPath, 'utf-8');
    return PackageManifestSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // 2. Fallback to Full version (ZIP)
  const file = packagePath(slug);
  const buf = await readFileOrThrow(file, slug);
  const entries = await unzipBuffer(buf);
  const raw = entries['manifest.json'];
  if (!raw) throw new PackageCorruptError(`manifest.json missing from ${slug}.corefirst`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(raw));
  } catch (e) {
    throw new PackageCorruptError(`manifest.json is not valid JSON: ${(e as Error).message}`);
  }
  return PackageManifestSchema.parse(parsed);
}

export async function readPackageAudio(slug: string, lesson: number, script: number): Promise<Uint8Array> {
  const manifest = await readPackageManifest(slug);
  const l = manifest.lessons[lesson];
  const s = l?.scripts[script];
  
  if (s?.audioFile) {
    const filename = s.audioFile;
    // 1. Try global pool first
    try {
      return new Uint8Array(await fs.readFile(mediaPath(filename)));
    } catch {
      // 2. Fall back to package's media folder inside the ZIP
      try {
        const buf = await readFileOrThrow(packagePath(slug), slug);
        const entries = await unzipBuffer(buf);
        const data = entries[`media/${filename}`];
        if (data) return data;
      } catch {
        // ZIP might not exist if it's a Lite-only install
      }
    }
  }

  // 3. Fallback to V1 index-based path (only works if ZIP exists)
  const file = packagePath(slug);
  const buf = await readFileOrThrow(file, slug);
  const entries = await unzipBuffer(buf);
  const key = `audio/l${lesson}s${script}.mp3`;
  const data = entries[key];
  if (!data) throw new PackageCorruptError(`audio entry "${key}" (or file) missing from ${slug}.corefirst`);
  return data;
}

export async function readPackageImage(slug: string, lesson: number): Promise<Uint8Array | null> {
  const manifest = await readPackageManifest(slug);
  const l = manifest.lessons[lesson];
  
  if (l?.imageFile) {
    const filename = l.imageFile;
    // 1. Try global pool first
    try {
      return new Uint8Array(await fs.readFile(mediaPath(filename)));
    } catch {
      // 2. Fall back to package's media folder inside the ZIP
      try {
        const buf = await readFileOrThrow(packagePath(slug), slug);
        const entries = await unzipBuffer(buf);
        const data = entries[`media/${filename}`];
        if (data) return data;
      } catch {
        // ZIP might not exist
      }
    }
  }

  // 3. Fallback to V1 index-based path
  try {
    const file = packagePath(slug);
    const buf = await readFileOrThrow(file, slug);
    const entries = await unzipBuffer(buf);
    const key = `images/l${lesson}.webp`;
    return entries[key] ?? null;
  } catch {
    return null;
  }
}

export async function listPackages(): Promise<{ slug: string; manifest: PackageManifest }[]> {
  await ensureDataDirs();
  let dirents: string[] = [];
  try {
    dirents = await fs.readdir(packagesDir());
  } catch {
    return [];
  }
  
  const seen = new Set<string>();
  const out: { slug: string; manifest: PackageManifest }[] = [];
  
  // Prioritize JSON manifests
  for (const name of dirents) {
    if (name.endsWith('.json')) {
      const slug = path.basename(name, '.json');
      try {
        const manifest = await readPackageManifest(slug);
        out.push({ slug, manifest });
        seen.add(slug);
      } catch (err) {
        console.error(`[storage] Skipping corrupt manifest ${slug}:`, (err as Error).message);
      }
    }
  }
  
  // Pick up any standalone .corefirst ZIPs
  for (const name of dirents) {
    if (name.endsWith('.corefirst')) {
      const slug = path.basename(name, '.corefirst');
      if (seen.has(slug)) continue;
      try {
        const manifest = await readPackageManifest(slug);
        out.push({ slug, manifest });
        seen.add(slug);
      } catch (err) {
        console.error(`[storage] Skipping corrupt package ${slug}:`, (err as Error).message);
      }
    }
  }
  
  return out;
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
    zip(entries, { level: 6 }, (err, data) => {
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
