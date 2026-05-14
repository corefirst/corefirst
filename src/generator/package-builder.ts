import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { TTSFactory } from '@/src/core/tts/factory';
import { VisualFactory } from '@/src/core/visuals/factory';
import type { TTSOverride, ImageOverride } from '@/src/lib/ai/settings-config';
import {
  buildSlug,
  resolveUniqueSlug,
  PACKAGE_FORMAT_VERSION,
  writePackage,
  sharedMediaPath,
  ensureDataDirs,
  pruneSharedOrphanMedia,
  DEFAULT_USER_ID,
  type PackageManifest,
  type WritePackageResult,
} from '@/src/lib/storage';
import { contentHash } from '@/src/lib/storage/hash';
import type { CoursewareManifest } from '@/src/types/courseware';

import type { ProgressEmitter } from './orchestrator';
// Re-export under the local name for callers who import from package-builder.
export type PackageProgressEmitter = ProgressEmitter;

export interface BuildPackageInput {
  manifest: CoursewareManifest;
  sourceLang: string;
  targetLang: string;
  /** When false, skip image generation entirely (e.g. cost / latency control). */
  generateImages?: boolean;
  /** Owner of this course package. Defaults to 'local' for single-user mode. */
  userId?: string;
  onProgress?: PackageProgressEmitter;
  /** Client-supplied provider overrides — takes priority over env-var config. */
  ttsOverride?: TTSOverride;
  imageOverride?: ImageOverride;
}

/**
 * Renders a `CoursewareManifest` into a `.corefirst` Lite manifest (and
 * optional Full ZIP) under the owning user's data root, populating the
 * per-user CAS media pool. The slug includes `topic` and gets a `-N` suffix
 * when an existing manifest already owns the base slug with a different
 * packageId, so multiple courses on the same industry/age/lang can coexist.
 */
export async function buildAndWritePackage(
  input: BuildPackageInput,
): Promise<WritePackageResult> {
  const userId = input.userId ?? DEFAULT_USER_ID;
  await ensureDataDirs(userId);

  const packageManifest = await mapToPackageManifest(input, userId);

  const emit = input.onProgress ?? (() => {});
  const tts = TTSFactory.getProvider(input.ttsOverride);
  const audioMap = new Map<string, Uint8Array>();
  const totalScripts = packageManifest.lessons.reduce((n, l) => n + l.scripts.length, 0);
  let audiosDone = 0;

  for (const lesson of packageManifest.lessons) {
    for (const script of lesson.scripts) {
      const hash = contentHash(script.ssml);
      const filename = `${hash}.mp3`;
      script.audioFile = filename;

      const poolFile = sharedMediaPath(filename);
      let audio: Uint8Array | null = null;
      try {
        audio = new Uint8Array(await fs.readFile(poolFile));
      } catch {
        try {
          audio = await tts.generateAudio(script.ssml);
          await fs.writeFile(poolFile, audio);
        } catch (err) {
          console.error(
            `[package-builder] Audio generation failed for script ${script.scriptIndex}:`,
            (err as Error).message,
          );
        }
      }
      if (audio) audioMap.set(`media/${filename}`, audio);
      audiosDone++;
      emit({ type: 'step', message: `Generating audio… (${audiosDone}/${totalScripts})` });
    }
  }

  const imageMap = new Map<string, Uint8Array>();
  if (input.generateImages !== false) {
    emit({ type: 'step', message: 'Generating images…' });
    const visuals = VisualFactory.getProvider(input.imageOverride);
    let imagesDone = 0;
    const totalImages = packageManifest.lessons.filter(l => l.visual_generation_prompts[0]).length;
    for (const lesson of packageManifest.lessons) {
      const prompt = lesson.visual_generation_prompts[0];
      if (!prompt) continue;

      const hash = contentHash(prompt);
      const filename = `${hash}.webp`;
      lesson.imageFile = filename;

      const poolFile = sharedMediaPath(filename);
      let image: Uint8Array | null = null;
      try {
        image = new Uint8Array(await fs.readFile(poolFile));
      } catch {
        try {
          const dataUrl = await visuals.generateImage(prompt);
          const bytes = decodeDataUrl(dataUrl);
          if (bytes) {
            image = bytes;
            await fs.writeFile(poolFile, bytes);
          }
        } catch (err) {
          console.error(
            `[package-builder] Image generation failed for lesson ${lesson.lessonIndex}:`,
            (err as Error).message,
          );
        }
      }
      if (image) imageMap.set(`media/${filename}`, image);
      imagesDone++;
      emit({ type: 'step', message: `Generating images… (${imagesDone}/${totalImages})` });
    }
  }

  emit({ type: 'step', message: 'Packaging…' });
  const result = await writePackage(userId, {
    manifest: packageManifest,
    audio: audioMap,
    images: imageMap,
  });

  // Sweep shared orphans in the background — best-effort, never block the response.
  pruneSharedOrphanMedia().catch((err) =>
    console.error('[package-builder] pruneSharedOrphanMedia failed:', (err as Error).message),
  );

  return result;
}

async function mapToPackageManifest(
  input: BuildPackageInput,
  userId: string,
): Promise<PackageManifest> {
  const { manifest } = input;
  const baseSlug = buildSlug(
    manifest.industry_context,
    input.targetLang,
    manifest.age_group,
    manifest.topic,
  );
  const packageId = randomUUID();
  // resolveUniqueSlug returns the base slug if free; or the same slug if it's
  // owned by this packageId (re-save); or `-2`/`-3`/… if a DIFFERENT course
  // already owns it. Eliminates the silent-overwrite bug.
  const slug = await resolveUniqueSlug(userId, baseSlug, packageId);

  return {
    packageId,
    slug,
    topic: manifest.topic,
    ageGroup: manifest.age_group,
    industry: manifest.industry_context,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    createdAt: new Date().toISOString(),
    version: PACKAGE_FORMAT_VERSION,
    lessons: manifest.lessons.map((lesson, lessonIndex) => ({
      lessonIndex,
      title: lesson.title,
      scenario_desc: lesson.scenario_description,
      vocabulary_focus: lesson.vocabulary_focus,
      visual_generation_prompts: lesson.visual_generation_prompts,
      scripts: lesson.cflt_scripts.map((s, scriptIndex) => ({
        scriptIndex,
        speaker: s.speaker,
        cfltL1: s.cflt_l1,
        cfltL2: s.cflt_l2,
        standardL2: s.standard_l2,
        standardL1: s.standard_l1 ?? '',
        ssml: s.ssml,
      })),
    })),
  };
}

function decodeDataUrl(url: string): Uint8Array | null {
  const match = /^data:[^;]+;base64,(.*)$/.exec(url);
  if (!match) return null;
  return Uint8Array.from(Buffer.from(match[1], 'base64'));
}
