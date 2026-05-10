import * as path from 'path';
import * as fs from 'fs/promises';

function getDataRoot() {
  return process.env.COREFIRST_DATA_DIR
    ? path.resolve(process.env.COREFIRST_DATA_DIR)
    : path.join(process.cwd(), 'data');
}

export function packagesDir(): string {
  return path.join(getDataRoot(), 'packages');
}

export function recordsDir(): string {
  return path.join(getDataRoot(), 'records');
}

export function mediaDir(): string {
  return path.join(getDataRoot(), 'media');
}

export function packagePath(slug: string): string {
  return path.join(packagesDir(), `${slug}.corefirst`);
}

export function manifestPath(slug: string): string {
  return path.join(packagesDir(), `${slug}.json`);
}

export function recordPath(slug: string): string {
  return path.join(recordsDir(), `${slug}.cfstate`);
}

export function logPath(slug: string): string {
  return path.join(recordsDir(), `${slug}.cflog`);
}

export function globalLogPath(): string {
  return path.join(recordsDir(), `global.cflog`);
}

export function globalSRSPath(): string {
  return path.join(recordsDir(), `user.cfsrs`);
}

export function mediaPath(filename: string): string {
  return path.join(mediaDir(), filename);
}

export function globalRecordPath(): string {
  return path.join(recordsDir(), `global.cfrecord`);
}

export function buildSlug(industry: string, targetLang: string, ageGroup: string): string {
  return [industry, targetLang, ageGroup]
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean)
    .join('-');
}

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(packagesDir(), { recursive: true });
  await fs.mkdir(recordsDir(), { recursive: true });
  await fs.mkdir(mediaDir(), { recursive: true });
}
