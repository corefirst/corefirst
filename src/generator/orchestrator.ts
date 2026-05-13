import { generateObject, NoObjectGeneratedError, type LanguageModel } from 'ai';
import { courseGenModel } from '@/src/lib/ai';
import { loadSkill } from '@/src/lib/skills';
import { CFLTTransformer } from '../core/transformer';
import {
  CoursewareManifest,
  CoursewareManifestSchema,
} from '../types/courseware';

const AGE_GROUP_GUIDANCE: Record<string, string> = {
  'Young Child (Under 12)':  'Picture-book words only; no abstractions. Keep each CFLT element ≤ 6 words. Tone: warm, playful, encouraging. Typical scenarios: fairy tale, zoo, park, bedtime, art table.',
  'Young Learner (Age 12+)': 'Everyday + basic school vocabulary. Tone: friendly, curious. Typical scenarios: school life, hobbies, outdoor activities, simple travel.',
  'Teenager':                'Casual contemporary language; light slang acceptable. Tone: relatable, energetic. Typical scenarios: social life, sports, entertainment, part-time work.',
  'Adult / Professional':    'Full adult vocabulary; technical terms when appropriate. Tone: neutral to formal. Typical scenarios: workplace and industry-specific professional settings.',
};

const INDUSTRY_GUIDANCE: Record<string, string> = {
  'General / Life':           'Everyday situations: grocery shopping, transport, household tasks, small talk.',
  'Stories / Fairy Tales':    'Narrative characters (princess, dragon, wizard, knight); once-upon-a-time storytelling format; simple plot-driven sentences.',
  'Animals / Nature':         'Real animals and nature vocabulary (puppy, butterfly, river, forest); settings: zoo, park, farm, garden.',
  'Arts & Crafts':            'Making/creating verbs as [Core Actions] (draw, cut, fold, paint, glue); settings: art room, craft table, classroom.',
  'Music / Songs':            'Rhythm and performance vocabulary (sing, clap, strum, beat, melody); settings: music class, choir, concert.',
  'School / Academic':        'Study-skill verbs (explain, practise, revise, submit, grade); settings: classroom, library, study group, homework.',
  'Hobbies / Interests':      'Passion-driven actions tied to the learner\'s hobby; settings: club meetings, weekend activities, competitions.',
  'Sports / Recreation':      'Physical action verbs (run, kick, defend, score, train); settings: training session, match day, gym.',
  'Social / Daily Life':      'Interpersonal interactions (greet, invite, apologize, thank, arrange); settings: friendships, cafés, social events.',
  'IT / Software Engineering':'Engineering verbs as [Core Actions] (deploy, refactor, debug, optimize, ship); settings: code review, system architecture, incident response.',
  'Medical / Healthcare':     'Clinical vocabulary (diagnose, prescribe, examine, treat, monitor); settings: patient consultation, ward rounds, clinic.',
  'Business / Finance':       'Commercial verbs (negotiate, budget, forecast, pitch, close); settings: meetings, presentations, client negotiations.',
  'Legal / Law':              'Formal legal vocabulary (draft, dispute, comply, rule, appeal, enforce); settings: contracts, hearings, client consultations.',
  'Education / Teaching':     'Instructional verbs (explain, assess, mentor, demonstrate, evaluate); settings: classroom, curriculum planning, parent meetings.',
  'Design / Creative':        'Creative-process verbs (sketch, iterate, prototype, revise, present); settings: design studio, client brief, critique session.',
  'Sales / Marketing':        'Persuasion vocabulary (pitch, convert, retain, campaign, segment, launch); settings: client calls, product launches, market analysis.',
  'Travel / Hospitality':     'Journey vocabulary (check in, board, recommend, reserve, explore); settings: airports, hotels, tour guides.',
  'Logistics / Operations':   'Process verbs (ship, track, schedule, coordinate, optimise); settings: warehouses, dispatch, supply-chain planning.',
};

function resolveGuidance(map: Record<string, string>, key: string, fallback: string): string {
  return map[key] ?? `${fallback}: ${key}`;
}

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
    if (!modelOverride) console.log('[ai/courseGen] no UI settings — using env fallback');
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
      AGE_GROUP_GUIDANCE: resolveGuidance(AGE_GROUP_GUIDANCE, request.age_group, 'Age group'),
      INDUSTRY_GUIDANCE:  resolveGuidance(INDUSTRY_GUIDANCE, request.industry_context, 'Industry context'),
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
    // Parallel self-audit: re-verify cflt structure and backfill standard_l1.
    // Young Child (Under 12) uses the lightweight auditScript schema because
    // their sentences are intentionally simple and don't reliably fill all four
    // CFLT slots — the strict corrections/slots schema causes consistent false
    // failures. All other age groups use the full transform for proper CFLT audit.
    const isYoungChild = request.age_group === 'Young Child (Under 12)';
    const auditTasks = manifest.lessons.flatMap((lesson) =>
      lesson.cflt_scripts.map(async (script) => {
        if (isYoungChild) {
          const auditResult = await this.transformer.auditScript(
            script.standard_l2,
            sourceLang,
            targetLang,
          );
          if (!('error' in auditResult)) {
            script.cflt_l1 = auditResult.cflt_l1;
            script.cflt_l2 = auditResult.cflt_l2;
            if (auditResult.standard_l1) script.standard_l1 = auditResult.standard_l1;
          }
        } else {
          const auditResult = await this.transformer.transform(
            script.standard_l2,
            sourceLang,
            targetLang,
          );
          if (!('error' in auditResult)) {
            script.cflt_l1 = auditResult.cflt_l1;
            script.cflt_l2 = auditResult.cflt_l2;
            if (auditResult.standard_l1) script.standard_l1 = auditResult.standard_l1;
          } else {
            console.error('[orchestrator] Script audit failed:', auditResult.error);
          }
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
