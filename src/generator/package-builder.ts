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
import { classifyAIError } from '@/src/lib/ai/errors';

import type { ProgressEmitter } from './orchestrator';
// Re-export under the local name for callers who import from package-builder.
export type PackageProgressEmitter = ProgressEmitter;

export interface BuildPackageInput {
  manifest: CoursewareManifest;
  sourceLang: string;
  targetLang: string;
  /** When false, skip audio generation entirely (e.g. cost / latency control). */
  generateAudio?: boolean;
  /** When false, skip image generation entirely (e.g. cost / latency control). */
  generateImages?: boolean;
  /** Owner of this course package. Defaults to 'local' for single-user mode. */
  userId?: string;
  onProgress?: PackageProgressEmitter;
  /** Client-supplied provider overrides — takes priority over env-var config. */
  ttsOverride?: TTSOverride;
  imageOverride?: ImageOverride;
}

export interface BuildPackageResult extends WritePackageResult {
  /** True if media generation halted because the cloud gateway returned
   *  INSUFFICIENT_CREDITS — the caller surfaces this as a partial-result
   *  signal to the client. */
  creditsExhausted?: boolean;
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
): Promise<BuildPackageResult> {
  const userId = input.userId ?? DEFAULT_USER_ID;
  await ensureDataDirs(userId);

  const packageManifest = await mapToPackageManifest(input, userId);

  const emit = input.onProgress ?? (() => {});
  // Once a credits-exhausted failure is observed, suppress every remaining
  // audio/image call so we don't fan out N error reports — the UI just needs
  // one clear "stopped — top up" signal plus the partial assets that did
  // succeed before the wall hit.
  let creditsExhausted = false;
  const audioMap = new Map<string, Uint8Array>();
  const imageMap = new Map<string, Uint8Array>();

  const audioPhase = async () => {
    if (input.generateAudio === false) return;
    const tts = TTSFactory.getProvider(input.ttsOverride);
    const tasks: Promise<void>[] = [];
    for (const [lessonIdx, lesson] of packageManifest.lessons.entries()) {
      for (const [scriptIdx, script] of lesson.scripts.entries()) {
        tasks.push((async () => {
          if (creditsExhausted) {
            emit({ type: 'lesson-audio', lessonIndex: lessonIdx, scriptIndex: scriptIdx, status: 'skipped' });
            return;
          }
          emit({ type: 'lesson-audio', lessonIndex: lessonIdx, scriptIndex: scriptIdx, status: 'generating' });
          const hash = contentHash(script.ssml);
          const filename = `${hash}.mp3`;
          const poolFile = sharedMediaPath(filename);
          let audio: Uint8Array | null = null;
          try {
            audio = new Uint8Array(await fs.readFile(poolFile));
          } catch {
            try {
              audio = await tts.generateAudio(script.ssml);
              await fs.writeFile(poolFile, audio);
            } catch (err) {
              if (classifyAIError(err) === 'INSUFFICIENT_CREDITS') {
                creditsExhausted = true;
                emit({
                  type: 'lesson-audio',
                  lessonIndex: lessonIdx,
                  scriptIndex: scriptIdx,
                  status: 'failed',
                  code: 'INSUFFICIENT_CREDITS',
                });
                return;
              }
              const msg = (err as Error).message;
              const cause = (err as { cause?: unknown }).cause;
              console.error(
                `[package-builder] Audio generation failed for script ${script.scriptIndex}:`,
                msg,
                cause ? `| Cause: ${JSON.stringify(cause)}` : '',
              );
              emit({ type: 'lesson-audio', lessonIndex: lessonIdx, scriptIndex: scriptIdx, status: 'failed' });
              return;
            }
          }
          if (audio) {
            audioMap.set(`media/${filename}`, audio);
            script.audioFile = filename;
            const audioUrl = `/api/media/${filename}`;
            if (input.manifest.lessons[lessonIdx]?.cflt_scripts[scriptIdx]) {
              input.manifest.lessons[lessonIdx].cflt_scripts[scriptIdx].audioUrl = audioUrl;
            }
            emit({
              type: 'lesson-audio',
              lessonIndex: lessonIdx,
              scriptIndex: scriptIdx,
              status: 'done',
              audioUrl,
            });
          }
        })());
      }
    }
    await Promise.all(tasks);
  };

  const imagePhase = async () => {
    if (input.generateImages === false) return;
    const visuals = VisualFactory.getProvider(input.imageOverride);
    const tasks: Promise<void>[] = [];
    for (const [lessonIdx, lesson] of packageManifest.lessons.entries()) {
      const prompt = lesson.visual_generation_prompts[0];
      if (!prompt) continue;
      tasks.push((async () => {
        if (creditsExhausted) {
          emit({ type: 'lesson-image', lessonIndex: lessonIdx, status: 'skipped' });
          return;
        }
        emit({ type: 'lesson-image', lessonIndex: lessonIdx, status: 'generating' });
        // Same hash key as api/generate-image (prompt + default size) so a
        // lesson regeneration reuses the cached image.
        const hash = contentHash(`${prompt}:1024x1024`);
        const filename = `${hash}.webp`;
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
            if (classifyAIError(err) === 'INSUFFICIENT_CREDITS') {
              creditsExhausted = true;
              emit({
                type: 'lesson-image',
                lessonIndex: lessonIdx,
                status: 'failed',
                code: 'INSUFFICIENT_CREDITS',
              });
              return;
            }
            const msg = (err as Error).message;
            const cause = (err as { cause?: unknown }).cause;
            console.error(
              `[package-builder] Image generation failed for lesson ${lesson.lessonIndex}:`,
              msg,
              cause ? `| Cause: ${JSON.stringify(cause)}` : '',
            );
            emit({ type: 'lesson-image', lessonIndex: lessonIdx, status: 'failed' });
            return;
          }
        }
        if (image) {
          imageMap.set(`media/${filename}`, image);
          lesson.imageFile = filename;
          const imageUrl = `/api/media/${filename}`;
          if (input.manifest.lessons[lessonIdx]) {
            input.manifest.lessons[lessonIdx].imageUrl = imageUrl;
          }
          emit({
            type: 'lesson-image',
            lessonIndex: lessonIdx,
            status: 'done',
            imageUrl,
          });
        }
      })());
    }
    await Promise.all(tasks);
  };

  // Audio + images run concurrently — they target independent providers,
  // and serializing the two phases was the largest source of latency in
  // the previous implementation.
  await Promise.all([audioPhase(), imagePhase()]);

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

  return { ...result, creditsExhausted };
}

async function mapToPackageManifest(
  input: BuildPackageInput,
  userId: string,
): Promise<PackageManifest> {
  const { manifest } = input;
  const baseSlug = buildSlug(
    manifest.domain_context,
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
    domain: manifest.domain_context,
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
