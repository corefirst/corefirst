import { generateObject, NoObjectGeneratedError, type LanguageModel } from 'ai';
import { courseGenModel } from '@/src/lib/ai';
import { loadSkill } from '@/src/lib/skills';
import { CFLTTransformer } from '../core/transformer';
import {
  CoursewareManifest,
  CoursewareManifestSchema,
} from '../types/courseware';


export interface GenerationRequest {
  age_group: string;
  industry_context: string;
  topic: string;
  sourceLang?: string;
  targetLang?: string;
}

// Shared progress event emitter — both orchestrator and package-builder use this type.
export type ProgressEmitter = (event: { type: string; message: string; [k: string]: unknown }) => void;

export class CoursewareOrchestrator {
  private transformer: CFLTTransformer;
  private model: LanguageModel;
  private emit: ProgressEmitter;

  constructor(modelOverride?: LanguageModel, onProgress?: ProgressEmitter) {
    this.model = modelOverride ?? courseGenModel;
    this.transformer = new CFLTTransformer(modelOverride);
    this.emit = onProgress ?? (() => {});
  }

  async generate(
    request: GenerationRequest,
    userId?: string,
  ): Promise<CoursewareManifest | { error: string; raw: string }> {
    this.emit({ type: 'step', message: 'Designing lessons…' });
    const sourceLang = request.sourceLang || 'Chinese';
    const targetLang = request.targetLang || 'English';
    const dynamicPrompt = await loadSkill('courseware-gen', {
      SOURCE_LANG: sourceLang,
      TARGET_LANG: targetLang,
    }, userId);
    const userPrompt = JSON.stringify(request);

    let manifest: CoursewareManifest;
    try {
      manifest = await this.callOnce(dynamicPrompt, userPrompt);
    } catch (firstErr) {
      const firstRaw = NoObjectGeneratedError.isInstance(firstErr) ? (firstErr.text ?? '') : '';
      console.error(
        '[orchestrator] First attempt failed:',
        firstErr instanceof Error ? firstErr.message : String(firstErr),
      );
      if (firstRaw) console.error('[orchestrator] First attempt raw output (truncated):', firstRaw.slice(0, 500));

      // Salvage: weaker models often wrap valid JSON in ```json fences or
      // add prose. Strip and re-validate before paying for a network retry.
      const salvaged = trySalvage(firstRaw);
      if (salvaged) {
        console.warn('[orchestrator] Recovered by salvaging raw output.');
        manifest = salvaged;
      } else {
        try {
          const repairInstr = await loadSkill('courseware-repair', {}, userId);
          manifest = await this.callOnce(
            dynamicPrompt + '\n\n' + repairInstr,
            userPrompt,
          );
          console.warn('[orchestrator] Recovered on repair retry.');
        } catch (secondErr) {
          const secondRaw = NoObjectGeneratedError.isInstance(secondErr) ? (secondErr.text ?? '') : '';
          const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
          console.error('[orchestrator] Repair retry failed:', msg);
          if (secondRaw) console.error('[orchestrator] Repair retry raw output (truncated):', secondRaw.slice(0, 500));
          const salvagedRetry = trySalvage(secondRaw);
          if (salvagedRetry) {
            console.warn('[orchestrator] Recovered by salvaging repair-retry output.');
            manifest = salvagedRetry;
          } else {
            return { error: msg, raw: secondRaw || firstRaw };
          }
        }
      }
    }

    // Backfill SSML when the model omitted it (or the repair retry coerced it
    // away). A bare-text wrapper is good enough for TTS — no prosody, but
    // playable. Better than failing the whole manifest.
    for (const lesson of manifest.lessons) {
      for (const script of lesson.cflt_scripts) {
        if (!script.ssml || !script.ssml.trim()) {
          script.ssml = `<speak>${escapeSsml(script.standard_l2)}</speak>`;
        }
      }
    }

    this.emit({ type: 'step', message: 'Auditing scripts…' });
    // Parallel self-audit: re-run every script through CFLTTransformer concurrently
    const auditTasks = manifest.lessons.flatMap((lesson) =>
      lesson.cflt_scripts.map(async (script) => {
        const auditResult = await this.transformer.transform(
          script.standard_l2,
          sourceLang,
          targetLang,
        );
        if (!('error' in auditResult)) {
          script.cflt_l1 = auditResult.cflt_l1;
          script.cflt_l2 = auditResult.cflt_l2;
          // The course-generation prompt does not ask the LLM for the natural
          // native-language rendering, so we backfill it from the audit pass —
          // that's the canonical place where the transformer produces all four
          // bilingual representations from a single standard_l2 input.
          if (auditResult.standard_l1) {
            script.standard_l1 = auditResult.standard_l1;
          }
        } else {
          console.error('[orchestrator] Script audit failed:', auditResult.error);
        }
      })
    );

    await Promise.all(auditTasks);
    this.emit({ type: 'step', message: 'Generating audio…' });

    return manifest;
  }

  private async callOnce(system: string, prompt: string): Promise<CoursewareManifest> {
    const { object } = await generateObject({
      model: this.model,
      schema: CoursewareManifestSchema,
      system,
      prompt,
    });
    return object;
  }
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Best-effort salvage for raw model output that the AI SDK couldn't parse.
// Strips ```json / ``` fences and surrounding prose, plus the common
// `{ "CoursewareManifest": {...} }` wrap, then validates against the schema.
// Returns null if nothing usable falls out — callers fall back to a retry.
// Exported for unit tests.
export function trySalvage(raw: string): CoursewareManifest | null {
  if (!raw || !raw.trim()) return null;
  const candidates: string[] = [];

  // 1) strip markdown fences (```json ... ``` or plain ``` ... ```)
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());

  // 2) raw text minus everything before the first { and after the last }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));

  // 3) the raw text as-is (in case it's already clean JSON the SDK rejected)
  candidates.push(raw.trim());

  for (const text of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    // Unwrap a few common malformations the model emits.
    const unwrapped = unwrap(parsed);
    const result = CoursewareManifestSchema.safeParse(unwrapped);
    if (result.success) return result.data;
  }
  return null;
}

function unwrap(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = parsed as Record<string, unknown>;
  // `{ "CoursewareManifest": {...} }`
  if (obj.CoursewareManifest && typeof obj.CoursewareManifest === 'object') {
    return obj.CoursewareManifest;
  }
  return obj;
}
