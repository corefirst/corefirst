import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject, type LanguageModel } from 'ai';
import { roleplayModel } from '@/src/lib/ai';
import { upsertRoleplaySession } from '@/src/lib/storage';
import * as fs from 'fs/promises';
import { mediaPath, sharedMediaPath, ensureDataDirs } from '@/src/lib/storage/paths';
import { contentHash } from '@/src/lib/storage/hash';
import { TTSFactory } from '@/src/core/tts/factory';
import { getUserId } from '@/src/lib/auth/user';
import { resolveTextContext, resolveTTSContext } from '@/src/lib/ai/request-context';
import { buildAIErrorResponse } from '@/src/lib/ai/errors';
import { loadSkill } from '@/src/lib/skills';
import { readPack } from '@/src/lib/roleplay-pack/loader';
import { renderForRoleplay } from '@/src/lib/roleplay-pack/injector';

const ALLOWED_LANGUAGES = new Set([
  'Chinese', 'English', 'Japanese', 'Korean', 'Vietnamese', 'Spanish', 'French', 'German',
]);
const MAX_CONTEXT_LEN = 500;
const MAX_MESSAGES_JSON_LEN = 8192;

// ... (Schema definitions remain unchanged)
// More flexible slot schema to handle model variations (strings, objects, or nulls)
const SlotSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return { content: '', is_inferred: true };
    if (typeof val === 'string') return { content: val, is_inferred: false };
    return val;
  },
  z.object({
    content: z.string().default(''),
    is_inferred: z.boolean().default(false)
  }).passthrough().default({ content: '', is_inferred: true })
);

const CrstSchema = z.object({
  core:   SlotSchema,
  reason: SlotSchema,
  space:  SlotSchema,
  time:   SlotSchema,
}).catchall(z.any()); // Allow extra fields like is_inferred at the top level
const ErrorItemSchema = z.object({
  type: z.string(), // Changed from enum to string for better compatibility
  original: z.string(),
  correction: z.string(),
  note: z.string()
});
const UserAnalysisSchema = z.object({ corrected: z.string(), errors: z.array(ErrorItemSchema), crst: CrstSchema, standard_l1: z.string() });
const CoachAnalysisSchema = z.object({ crst: CrstSchema, standard_l1: z.string() });
const RoleplayResponseSchemaFull = z.object({
  reply: z.string(),
  ssml: z.string(),
  user_analysis: UserAnalysisSchema,
  coach_analysis: CoachAnalysisSchema,
  feedback: z.string().nullable().optional(), // Now optional
  session_title: z.string().nullable().optional() // Now optional
});

const RoleplayResponseSchemaLean = z.object({
  reply: z.string(),
  ssml: z.string(),
  feedback: z.string().nullable().optional(), // Now optional
  session_title: z.string().nullable().optional() // Now optional
});
const RoleplayRequestSchema = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })), sourceLang: z.string(), targetLang: z.string(), context: z.string().optional(), audio: z.object({ data: z.string(), type: z.string().optional() }).optional(), sessionId: z.string().uuid().optional(), packageSlug: z.string().optional(), analysisEnabled: z.boolean().optional(), packId: z.string().optional(), scenarioId: z.string().optional(), personaId: z.string().optional() });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RoleplayRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    
    const { messages, sourceLang, targetLang, context, audio, sessionId, packageSlug, analysisEnabled, packId, scenarioId, personaId } = parsed.data;
    const analysisOn = analysisEnabled === true;

    if (!ALLOWED_LANGUAGES.has(sourceLang) || !ALLOWED_LANGUAGES.has(targetLang)) {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }

    const [{ model: modelOverride, userId }, { ttsOverride }] = await Promise.all([
      resolveTextContext('roleplay', request),
      resolveTTSContext(request),
    ]);
    await ensureDataDirs(userId);

    if (!modelOverride) console.log('[ai/roleplay] no UI settings — using env fallback');
    const activeModel = (modelOverride ?? roleplayModel) as LanguageModel;

    // 1. Process and Save user audio if present (Commit-on-Submit)
    let savedAudioFile: string | undefined;
    if (audio) {
      const audioBytes = new Uint8Array(Buffer.from(audio.data, 'base64'));
      const hash = contentHash(audio.data);
      const extension = (audio.type?.split('/')[1] || 'webm').replace(/;.*$/, '');
      savedAudioFile = `${hash}.${extension}`;
      const poolFile = mediaPath(userId, savedAudioFile);
      try { await fs.access(poolFile); } catch { await fs.writeFile(poolFile, audioBytes); }
    }

    let packSection = '';
    let effectiveContext = context;
    if (packId) {
      const entry = await readPack(userId, packId);
      if (entry) {
        const rendered = renderForRoleplay(entry.pack, scenarioId, personaId);
        packSection = rendered.packSection;
        if (!effectiveContext) effectiveContext = rendered.derivedContext;
      } else {
        console.warn(`[roleplay] Requested pack '${packId}' not found — falling back to free-text context.`);
      }
    }

    const safeContext = (effectiveContext ?? 'General daily life').replace(/[\x00-\x1F\x7F]/g, '').slice(0, MAX_CONTEXT_LEN);

    const baseSystemInstructions = await loadSkill('roleplay-coach', {
      SOURCE_LANG: sourceLang,
      TARGET_LANG: targetLang,
      CONTEXT: safeContext,
      PACK_SECTION: packSection,
    }, userId);
    const fullSystemPrompt = baseSystemInstructions + await loadSkill('roleplay-analysis', {
      SOURCE_LANG: sourceLang,
    }, userId);

    const promptText = JSON.stringify(messages.slice(-10));

    let result: any;
    try {
      const { object } = analysisOn
        ? await generateObject({ model: activeModel, schema: RoleplayResponseSchemaFull, system: fullSystemPrompt, prompt: promptText })
        : await generateObject({ model: activeModel, schema: RoleplayResponseSchemaLean, system: baseSystemInstructions, prompt: promptText });
      result = object;
    } catch (e) {
      const raw = (e as any).text || '';
      console.warn('[roleplay] Primary parse failed, attempting salvage...');
      const schema = analysisOn ? RoleplayResponseSchemaFull : RoleplayResponseSchemaLean;
      const salvaged = trySalvageRoleplay(raw, schema);
      if (salvaged) {
        result = salvaged;
      } else {
        console.error('[roleplay] Salvage failed. Raw output:', raw);
        throw e;
      }
    }

    const fullResult = 'user_analysis' in result ? (result as z.infer<typeof RoleplayResponseSchemaFull>) : null;

    // 2. Generate Standard Audio for the corrected sentence (if mode is ON)
    // Corrected audio is TTS (deterministic, no personal data) → shared pool
    let correctedAudioFile: string | undefined;
    if (fullResult?.user_analysis?.corrected) {
      const text = fullResult.user_analysis.corrected;
      const hash = contentHash(text);
      const filename = `${hash}.mp3`;
      const poolFile = sharedMediaPath(filename);
      try {
        await fs.access(poolFile);
        correctedAudioFile = filename;
      } catch {
        try {
          const tts = TTSFactory.getProvider(ttsOverride ?? undefined);
          const bytes = await tts.generateAudio(text);
          await fs.writeFile(poolFile, bytes);
          correctedAudioFile = filename;
        } catch (err) {
          console.error('[roleplay] TTS error:', (err as Error).message);
        }
      }
    }

    if (sessionId) {
      const now = new Date().toISOString();
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const userAnalysis = fullResult?.user_analysis;
      const coachAnalysis = fullResult?.coach_analysis;

      const newMessages = [
        ...(lastUser
          ? [{
              role: 'user' as const,
              content: lastUser.content,
              createdAt: now,
              audioFile: savedAudioFile,
              correctedAudioFile,
              userAnalysis,
            }]
          : []),
        {
          role: 'assistant' as const,
          content: result.reply,
          createdAt: now,
          coachAnalysis,
          feedback: result.feedback ?? null,
        },
      ];
      try {
        const finalTitle = result.session_title || context || safeContext;
        await upsertRoleplaySession(userId, packageSlug ?? null, {
          sessionId, context: finalTitle, sourceLang, targetLang, newMessages: newMessages as any,
        });
      } catch (err) {
        console.error('[roleplay] Persistence error:', (err as Error).message);
      }
    }

    return NextResponse.json({ ...result, audioFile: savedAudioFile, correctedAudioFile });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const raw = (error as any).text || '';
    console.error('[roleplay] Error:', msg);
    if (raw) console.error('[roleplay] Raw response:', raw);
    
    const aiResponse = buildAIErrorResponse(error);
    if (aiResponse) return aiResponse;
    return NextResponse.json({ error: 'Roleplay failed', detail: msg }, { status: 500 });
  }
}

/**
 * Robustly extracts and validates a JSON object from raw model output.
 * Handles markdown fences, surrounding prose, and common object wrappers.
 */
function trySalvageRoleplay<T extends z.ZodType>(raw: string, schema: T): z.infer<T> | null {
  if (!raw || !raw.trim()) return null;
  const candidates: string[] = [];

  // 1) Strip markdown fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

  // 2) Greedy curly brace extraction
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  // 3) Raw text as-is
  candidates.push(raw.trim());

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text);
      // Unwrap common malformations
      const unwrapped = unwrapObject(parsed);
      const validated = schema.safeParse(unwrapped);
      if (validated.success) return validated.data;
    } catch {
      continue;
    }
  }
  return null;
}

function unwrapObject(parsed: any): any {
  if (!parsed || typeof parsed !== 'object') return parsed;
  // Handle models that wrap the response in a key matching the schema name
  const wrappers = ['RoleplayResponse', 'Response', 'analysis', 'data'];
  for (const key of wrappers) {
    if (parsed[key] && typeof parsed[key] === 'object') return parsed[key];
  }
  return parsed;
}
