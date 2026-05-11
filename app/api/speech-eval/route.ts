import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject, experimental_transcribe as transcribe } from 'ai';
import { speechEvalModel, sttModel } from '@/src/lib/ai';
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

    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());

    const { text: transcription } = await transcribe({
      model: sttModel,
      audio: audioBytes,
    });

    const evalSystemPrompt = `
You are a CFLT Speech Assessor with expertise in "Phonetic Migration."
Languages: From ${sourceLang} to ${targetLang}.

Assess the speech based on:
1. Pronunciation accuracy (0-100).
2. Logic Stress: did the user emphasize the [Core Action] correctly? (0-100).
3. CFLT Element Breakdown (0-100 for each):
   - score_core: Accuracy of the Core Action/Result element.
   - score_condition: Accuracy of the Condition/Reason element.
   - score_space: Accuracy of the Space/Context element.
   - score_time: Accuracy of the Time element.
4. Comparison: how close is the spoken text to the target?

CRITICAL — Phonetic Migration:
If ${sourceLang} is "Chinese", explain pronunciation errors using Pinyin references.
Example: "To fix your /v/, start with Pinyin 'f' but vibrate your cords."
Example: "To fix your /l/, start with Pinyin 'le' but keep the tongue tip on the teeth ridge."

Return the transcription you were given as-is in the "transcription" field.
`;

    const userPrompt = `Target Sentence: "${expectedText}"\nUser Spoke: "${transcription}"\n\nEvaluate this speech attempt.`;

    const { object: evaluation } = await generateObject({
      model: speechEvalModel,
      schema: SpeechEvalSchema,
      system: evalSystemPrompt,
      prompt: userPrompt,
    });

    const lessonIndex = typeof lessonIndexRaw === 'string' ? Number.parseInt(lessonIndexRaw, 10) : -1;
    const scriptIndex = typeof scriptIndexRaw === 'string' ? Number.parseInt(scriptIndexRaw, 10) : -1;

    try {
      const userId = await getUserId(request);
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
              
              // Update mastery for each token based on this attempt's overall score.
              for (const t of tokens) {
                await updateVocabularyMastery(userId, manifest.targetLang, t.token, evaluation.score);
              }
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
