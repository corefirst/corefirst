'use client';

const OFFLINE_CACHE = 'corefirst-offline-v1';
const META_KEY = 'cf-offline-slugs';

// --- localStorage helpers -------------------------------------------------

function readSlugs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeSlugs(slugs: string[]): void {
  localStorage.setItem(META_KEY, JSON.stringify(slugs));
}

export function getDownloadedSlugs(): string[] {
  return readSlugs();
}

export function isDownloaded(slug: string): boolean {
  return readSlugs().includes(slug);
}

function markDownloaded(slug: string): void {
  const slugs = readSlugs();
  if (!slugs.includes(slug)) writeSlugs([...slugs, slug]);
}

function unmarkDownloaded(slug: string): void {
  writeSlugs(readSlugs().filter((s) => s !== slug));
}

// --- Persistent storage ---------------------------------------------------

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator?.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// --- Download / remove ----------------------------------------------------

interface ManifestScript {
  audioUrl?: string;
  cfltAudioUrl?: string;
}

interface ManifestLesson {
  imageUrl?: string;
  cflt_scripts: ManifestScript[];
}

interface CourseManifestResponse {
  lessons: ManifestLesson[];
}

export async function downloadCourse(
  slug: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const manifestUrl = `/api/courses/${encodeURIComponent(slug)}`;

  // Fetch manifest first to enumerate all media URLs.
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok) throw new Error(`Failed to fetch manifest: ${manifestRes.status}`);

  const manifest: CourseManifestResponse = await manifestRes.clone().json();

  const mediaUrls: string[] = [];
  for (const lesson of manifest.lessons ?? []) {
    if (lesson.imageUrl) mediaUrls.push(lesson.imageUrl);
    for (const script of lesson.cflt_scripts ?? []) {
      if (script.audioUrl) mediaUrls.push(script.audioUrl);
      if (script.cfltAudioUrl) mediaUrls.push(script.cfltAudioUrl);
    }
  }

  const total = 1 + mediaUrls.length; // manifest + media
  let done = 0;

  const cache = await caches.open(OFFLINE_CACHE);

  // Cache manifest (already fetched — reuse the clone).
  await cache.put(manifestUrl, manifestRes);
  done++;
  onProgress?.(Math.round((done / total) * 100));

  // Also persist the course list so the shelf works offline.
  try {
    const listRes = await fetch('/api/history/courses');
    if (listRes.ok) await cache.put('/api/history/courses', listRes);
  } catch {
    // Non-fatal — shelf will still show downloaded courses via SW stale cache.
  }

  // Fetch and cache each media URL, skipping any that 404 or error.
  for (const url of mediaUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    } catch {
      // Skip unavailable media silently.
    }
    done++;
    onProgress?.(Math.round((done / total) * 100));
  }

  markDownloaded(slug);
}

export async function removeCourse(slug: string): Promise<void> {
  const cache = await caches.open(OFFLINE_CACHE);
  const keys = await cache.keys();
  const prefix = `/api/courses/${encodeURIComponent(slug)}`;
  await Promise.all(
    keys
      .filter((req) => req.url.includes(prefix))
      .map((req) => cache.delete(req)),
  );
  unmarkDownloaded(slug);
}
