import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { TTSFactory } from '@/src/core/tts/factory';
import { VisualFactory } from '@/src/core/visuals/factory';
import {
  buildSlug,
  PACKAGE_FORMAT_VERSION,
  writePackage,
  mediaPath,
  ensureDataDirs,
  type PackageManifest,
  type WritePackageResult,
} from '@/src/lib/storage';
import { contentHash } from '@/src/lib/storage/hash';
import type { CoursewareManifest } from '@/src/types/courseware';

export interface BuildPackageInput {
  manifest: CoursewareManifest;
  sourceLang: string;
  targetLang: string;
  /** When false, skip image generation entirely (e.g. cost / latency control). */
  generateImages?: boolean;
}

/**
 * Renders a `CoursewareManifest` (the LLM-facing schema in
 * src/types/courseware.ts) into a `.corefirst` package on disk: pre-renders
 * one MP3 per script and one optional WebP per lesson using Content-Addressable
 * Storage (CAS) for deduplication.
 */
export async function buildAndWritePackage(input: BuildPackageInput): Promise<WritePackageResult> {
  await ensureDataDirs();
  const packageManifest = mapToPackageManifest(input);

  const tts = TTSFactory.getProvider();
  const audioMap = new Map<string, Uint8Array>();
  
  for (const lesson of packageManifest.lessons) {
    for (const script of lesson.scripts) {
      const hash = contentHash(script.ssml);
      const filename = `${hash}.mp3`;
      script.audioFile = filename;
      
      const poolFile = mediaPath(filename);
      let audio: Uint8Array | null = null;
      
      try {
        // Try to reuse from global pool
        audio = new Uint8Array(await fs.readFile(poolFile));
      } catch {
        // Not in pool; generate and save
        try {
          const bytes = await tts.generateAudio(script.ssml);
          audio = bytes;
          await fs.writeFile(poolFile, bytes);
        } catch (err) {
          console.error(
            `[package-builder] Audio generation failed for script ${script.scriptIndex}:`,
            (err as Error).message,
          );
        }
      }
      
      if (audio) {
        audioMap.set(`media/${filename}`, audio);
      }
    }
  }

  const imageMap = new Map<string, Uint8Array>();
  if (input.generateImages !== false) {
    const visuals = VisualFactory.getProvider();
    for (const lesson of packageManifest.lessons) {
      const prompt = lesson.visual_generation_prompts[0];
      if (!prompt) continue;
      
      const hash = contentHash(prompt);
      const filename = `${hash}.webp`;
      lesson.imageFile = filename;
      
      const poolFile = mediaPath(filename);
      let image: Uint8Array | null = null;

      try {
        // Try to reuse from global pool
        image = new Uint8Array(await fs.readFile(poolFile));
      } catch {
        // Not in pool; generate and save
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
      
      if (image) {
        imageMap.set(`media/${filename}`, image);
      }
    }
  }

  return writePackage({ manifest: packageManifest, audio: audioMap, images: imageMap });
}

function mapToPackageManifest(input: BuildPackageInput): PackageManifest {
  const { manifest } = input;
  const slug = buildSlug(manifest.industry_context, input.targetLang, manifest.age_group);
  return {
    packageId: randomUUID(),
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
