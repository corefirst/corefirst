import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { speechEvalModel } from '@/src/lib/ai';
import { STTFactory } from '@/src/core/stt/factory';
import { extractSettings, resolveFeatureFromSettings, resolveSTTOverride } from '@/src/lib/ai/settings-config';
import { loadSkill } from '@/src/lib/skills';
import { LANG_MAP } from '@/src/lib/constants';
import {
  appendAttempt,
  readPackageManifest,
  captureVocabulary,
  updateVocabularyMastery,
} from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm', 'audio/mp4', 'audio/wav', 'audio/mpeg', 'audio/ogg',
]);

const SpeechEvalSchema = z.object({
  score: z.number(),
  pronunciation: z.number(),
  logic_stress: z.number(),
  score_core: z.number(),
  score_condition: z.number(),
  score_space: z.number(),
  score_time: z.number(),
  transcription: z.string(),
  feedback: z.string(),
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const audioFile = formData.get('audio');
    if (!(audioFile instanceof Blob)) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio file exceeds 10 MB limit' }, { status: 400 });
    }
    if (audioFile.type && !ALLOWED_AUDIO_TYPES.has(audioFile.type)) {
      return NextResponse.json({ error: 'Unsupported audio format' }, { status: 400 });
    }

    const expectedTextRaw = formData.get('expectedText');
    if (typeof expectedTextRaw !== 'string' || !expectedTextRaw.trim()) {
      return NextResponse.json({ error: 'expectedText is required' }, { status: 400 });
    }
    const expectedText = expectedTextRaw.trim();

    const sourceLang = (formData.get('sourceLang') as string | null) ?? 'Chinese';
    const targetLang = (formData.get('targetLang') as string | null) ?? 'English';

    // Course-context attempts include packageSlug + lessonIndex + scriptIndex
    // so they can be appended to the matching .cfrecord file. Transform-mode
    // and ad-hoc attempts omit these fields and are not persisted.
    const packageSlug = (formData.get('packageSlug') as string | null) ?? null;
    const lessonIndexRaw = formData.get('lessonIndex');
    const scriptIndexRaw = formData.get('scriptIndex');

    const mimeType = audioFile.type || 'audio/webm';
    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const languageCode = targetLang ? (LANG_MAP[targetLang] ?? undefined) : undefined;

    const settings = extractSettings(request);
    const sttOverride = resolveSTTOverride(settings);
    const sttProvider = STTFactory.getProvider(sttOverride ?? undefined);
    const evalModelOverride = resolveFeatureFromSettings('speechEval', settings);
    if (!evalModelOverride) console.log('[ai/speechEval] no UI settings — using env fallback');
    const activeEvalModel = evalModelOverride ?? speechEvalModel;

    const { text: transcription } = await sttProvider.transcribe(audioBytes, { language: languageCode, mimeType });
    const userId = await getUserId(request);

    const evalSystemPrompt = await loadSkill('speech-eval', {
      SOURCE_LANG: sourceLang,
      TARGET_LANG: targetLang,
    }, userId);

    const userPrompt = await loadSkill('speech-eval-user', {
      EXPECTED_TEXT: expectedText,
      TRANSCRIPTION: transcription,
    }, userId);

    const { object: evaluation } = await generateObject({
      model: activeEvalModel,
      schema: SpeechEvalSchema,
      system: evalSystemPrompt,
      prompt: userPrompt,
    });

    const lessonIndex = typeof lessonIndexRaw === 'string' ? Number.parseInt(lessonIndexRaw, 10) : -1;
    const scriptIndex = typeof scriptIndexRaw === 'string' ? Number.parseInt(scriptIndexRaw, 10) : -1;

    try {
      let packageId: string | null = null;
      if (packageSlug && packageSlug !== 'global' && packageSlug !== '_global') {
        try {
          const manifest = await readPackageManifest(userId, packageSlug);
          packageId = manifest.packageId;

          // Auto-capture and update mastery for vocabulary in this lesson.
          if (lessonIndex >= 0 && manifest.lessons[lessonIndex]) {
            const tokens = manifest.lessons[lessonIndex].vocabulary_focus;
            if (tokens && tokens.length > 0) {
              await captureVocabulary(
                userId,
                manifest.targetLang,
                tokens,
                { slug: packageSlug, lessonIndex, scriptIndex: Math.max(scriptIndex, 0) },
              );
              
              await updateVocabularyMastery(
                userId,
                manifest.targetLang,
                tokens.map((t) => t.token),
                evaluation.score,
              );
            }
          }
        } catch {
          // Not a real package or manifest missing
        }
      }

      await appendAttempt(userId, packageSlug, packageId, lessonIndex, scriptIndex, {
        transcription: evaluation.transcription,
        overallScore: evaluation.score,
        pronunciation: evaluation.pronunciation,
        logicStress: evaluation.logic_stress,
        feedback: evaluation.feedback,
        scoreCoreAction: evaluation.score_core,
        scoreCondition: evaluation.score_condition,
        scoreSpaceContext: evaluation.score_space,
        scoreTime: evaluation.score_time,
      });
    } catch (err) {
      console.error('[speech-eval] Failed to persist attempt:', (err as Error).message);
    }

    return NextResponse.json(evaluation);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[speech-eval] Error:', msg);
    return NextResponse.json({ error: 'Speech evaluation failed' }, { status: 500 });
  }
}
