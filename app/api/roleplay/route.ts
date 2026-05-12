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
import { extractSettings, resolveFeatureFromSettings } from '@/src/lib/ai/settings-config';
import { classifyAIError } from '@/src/lib/ai/errors';
import { loadPrompt } from '@/src/lib/prompts/loader';

const ALLOWED_LANGUAGES = new Set([
  'Chinese', 'English', 'Japanese', 'Korean', 'Vietnamese', 'Spanish', 'French', 'German',
]);
const MAX_CONTEXT_LEN = 500;
const MAX_MESSAGES_JSON_LEN = 8192;

// ... (Schema definitions remain unchanged)
const SlotSchema = z.object({ content: z.string(), is_inferred: z.boolean() });
const CrstSchema = z.object({ core: SlotSchema, reason: SlotSchema, space: SlotSchema, time: SlotSchema });
const ErrorTypeEnum = z.enum(['spelling', 'grammar', 'word_choice', 'word_order']);
const ErrorItemSchema = z.object({ type: ErrorTypeEnum, original: z.string(), correction: z.string(), note: z.string() });
const UserAnalysisSchema = z.object({ corrected: z.string(), errors: z.array(ErrorItemSchema), crst: CrstSchema, standard_l1: z.string() });
const CoachAnalysisSchema = z.object({ crst: CrstSchema, standard_l1: z.string() });
const RoleplayResponseSchemaFull = z.object({ reply: z.string(), ssml: z.string(), user_analysis: UserAnalysisSchema, coach_analysis: CoachAnalysisSchema, feedback: z.string().nullable(), session_title: z.string().optional() });
const RoleplayResponseSchemaLean = z.object({ reply: z.string(), ssml: z.string(), feedback: z.string().nullable(), session_title: z.string().optional() });
const RoleplayRequestSchema = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })), sourceLang: z.string(), targetLang: z.string(), context: z.string().optional(), audio: z.object({ data: z.string(), type: z.string().optional() }).optional(), sessionId: z.string().uuid().optional(), packageSlug: z.string().optional(), analysisEnabled: z.boolean().optional() });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RoleplayRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    
    const { messages, sourceLang, targetLang, context, audio, sessionId, packageSlug, analysisEnabled } = parsed.data;
    const analysisOn = analysisEnabled === true;

    if (!ALLOWED_LANGUAGES.has(sourceLang) || !ALLOWED_LANGUAGES.has(targetLang)) {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }

    const userId = await getUserId(request);
    await ensureDataDirs(userId);

    const settings = extractSettings(request);
    const activeModel: LanguageModel = resolveFeatureFromSettings('roleplay', settings) ?? roleplayModel;

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

    const safeContext = (context ?? 'General daily life').replace(/[\x00-\x1F\x7F]/g, '').slice(0, MAX_CONTEXT_LEN);

    const baseSystemInstructions = loadPrompt('src/prompts/roleplay_base.md', {
      SOURCE_LANG: sourceLang,
      TARGET_LANG: targetLang,
      CONTEXT: safeContext,
    });
    const fullSystemPrompt = baseSystemInstructions + loadPrompt('src/prompts/roleplay_analysis.md');

    const promptText = JSON.stringify(messages.slice(-10));

    type FullResult = z.infer<typeof RoleplayResponseSchemaFull>;
    type LeanResult = z.infer<typeof RoleplayResponseSchemaLean>;
    const result: FullResult | LeanResult = analysisOn
      ? (await generateObject({ model: activeModel, schema: RoleplayResponseSchemaFull, system: fullSystemPrompt, prompt: promptText })).object
      : (await generateObject({ model: activeModel, schema: RoleplayResponseSchemaLean, system: baseSystemInstructions, prompt: promptText })).object;

    const fullResult = 'user_analysis' in result ? (result as FullResult) : null;

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
          const tts = TTSFactory.getProvider();
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
          sessionId, context: finalTitle, sourceLang, targetLang, newMessages,
        });
      } catch (err) {
        console.error('[roleplay] Persistence error:', (err as Error).message);
      }
    }

    return NextResponse.json({ ...result, audioFile: savedAudioFile, correctedAudioFile });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[roleplay] Error:', msg);
    const code = classifyAIError(error);
    if (code === 'API_KEY_REQUIRED' || code === 'INVALID_API_KEY') {
      return NextResponse.json({ error: code }, { status: 401 });
    }
    return NextResponse.json({ error: 'Roleplay failed', detail: msg }, { status: 500 });
  }
}
