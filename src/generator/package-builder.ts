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
import { runUntilHalt } from '@/src/lib/utils/halt-queue';

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
    // Flatten (lesson, script) pairs so the worker pool can dequeue across
    // lessons. The halt-aware queue checks `creditsExhausted` between each
    // dispatch — fixes the prior fan-out bug where in-flight tasks past the
    // guard kept calling the provider after the wall was already hit.
    const scripts = packageManifest.lessons.flatMap((lesson, lessonIdx) =>
      lesson.scripts.map((script, scriptIdx) => ({ lesson, lessonIdx, script, scriptIdx })),
    );
    await runUntilHalt(scripts, () => creditsExhausted, async ({ lessonIdx, scriptIdx, script }, _i, halted) => {
      if (halted) {
        emit({ type: 'lesson-audio', lessonIndex: lessonIdx, scriptIndex: scriptIdx, status: 'skipped' });
        return;
      }
      emit({ type: 'lesson-audio', lessonIndex: lessonIdx, scriptIndex: scriptIdx, status: 'generating' });

      const generateAndCache = async (text: string): Promise<{ filename: string; audio: Uint8Array } | null> => {
        const hash = contentHash(text);
        const filename = `${hash}.mp3`;
        const poolFile = sharedMediaPath(filename);
        try {
          const audio = new Uint8Array(await fs.readFile(poolFile));
          return { filename, audio };
        } catch { /* not cached */ }
        try {
          const audio = await tts.generateAudio(text);
          await fs.writeFile(poolFile, audio);
          return { filename, audio };
        } catch (err) {
          if (classifyAIError(err) === 'INSUFFICIENT_CREDITS') {
            creditsExhausted = true;
          }
          throw err;
        }
      };

      try {
        // Standard sentence audio
        const standard = await generateAndCache(script.ssml);
        if (standard) {
          audioMap.set(`media/${standard.filename}`, standard.audio);
          script.audioFile = standard.filename;
          const audioUrl = `/api/media/${standard.filename}`;
          if (input.manifest.lessons[lessonIdx]?.cflt_scripts[scriptIdx]) {
            input.manifest.lessons[lessonIdx].cflt_scripts[scriptIdx].audioUrl = audioUrl;
          }
        }

        // CRST L2 structure audio — separate hash so it's cached independently
        const cflt = await generateAndCache(script.cfltL2);
        if (cflt) {
          audioMap.set(`media/${cflt.filename}`, cflt.audio);
          script.cfltAudioFile = cflt.filename;
          const cfltAudioUrl = `/api/media/${cflt.filename}`;
          if (input.manifest.lessons[lessonIdx]?.cflt_scripts[scriptIdx]) {
            input.manifest.lessons[lessonIdx].cflt_scripts[scriptIdx].cfltAudioUrl = cfltAudioUrl;
          }
        }

        emit({
          type: 'lesson-audio',
          lessonIndex: lessonIdx,
          scriptIndex: scriptIdx,
          status: 'done',
          audioUrl: script.audioFile ? `/api/media/${script.audioFile}` : undefined,
        });
      } catch (err) {
        if (creditsExhausted) {
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
      }
    });
  };

  const imagePhase = async () => {
    if (input.generateImages === false) return;
    const visuals = VisualFactory.getProvider(input.imageOverride);
    // Build the (lesson, prompt) work list — lessons without a prompt get a
    // synthetic `skipped` emit upfront so the UI's lesson row resolves out of
    // its `waiting` state instead of hanging forever (fix #9).
    const work: Array<{ lessonIdx: number; lesson: typeof packageManifest.lessons[number]; prompt: string }> = [];
    for (const [lessonIdx, lesson] of packageManifest.lessons.entries()) {
      const prompt = lesson.visual_generation_prompts[0];
      if (!prompt) {
        emit({ type: 'lesson-image', lessonIndex: lessonIdx, status: 'skipped' });
        continue;
      }
      work.push({ lessonIdx, lesson, prompt });
    }

    await runUntilHalt(work, () => creditsExhausted, async ({ lessonIdx, lesson, prompt }, _i, halted) => {
      if (halted) {
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
    });
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
    manifest.category_context,
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
    category: manifest.category_context,
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
