import { z } from 'zod';
import { type LanguageModel } from 'ai';
import { CoursewareOrchestrator } from '@/src/generator/orchestrator';
import { buildAndWritePackage } from '@/src/generator/package-builder';
import { getUserId } from '@/src/lib/auth/user';
import { extractSettings, resolveFeatureFromSettings, resolveTTSOverride, resolveImageOverride } from '@/src/lib/ai/settings-config';

const GenerateCourseRequestSchema = z.object({
  age_group: z.string().min(1),
  domain_context: z.string().min(1),
  topic: z.string().min(1).max(512),
  sourceLang: z.string().optional(),
  targetLang: z.string().optional(),
  generateAudio: z.boolean().optional(),
  generateImages: z.boolean().optional(),
});

// Returns an SSE stream so the client can show real-time progress.
// Each line: `data: <json>\n\n`
// Final event: `data: {"type":"complete","result":{...}}\n\n`
// Error event: `data: {"type":"error","message":"..."}\n\n`
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = GenerateCourseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const sourceLang = parsed.data.sourceLang || 'Chinese';
  const targetLang = parsed.data.targetLang || 'English';

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let isClosed = false;

  request.signal.addEventListener('abort', () => {
    isClosed = true;
    writer.close().catch(() => {});
  });

  const emit = (data: object) => {
    if (isClosed) return;
    const payload = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
    writer.write(payload).catch(() => {
      isClosed = true;
    });
  };

  // Run generation asynchronously so we can return the stream immediately
  (async () => {
    try {
      const settings = extractSettings(request);
      const modelOverride = resolveFeatureFromSettings('courseGen', settings) as LanguageModel | undefined;
      const ttsOverride = resolveTTSOverride(settings) ?? undefined;
      const imageOverride = resolveImageOverride(settings) ?? undefined;
      const userId = await getUserId(request);
      const orchestrator = new CoursewareOrchestrator(modelOverride, emit);

      const result = await orchestrator.generate({
        age_group: parsed.data.age_group,
        domain_context: parsed.data.domain_context,
        topic: parsed.data.topic,
        sourceLang,
        targetLang,
      }, userId);

      if (isClosed) return; // Stop if client disconnected

      if ('error' in result) {
        emit({ type: 'error', message: 'Course generation failed' });
        return;
      }
      const written = await buildAndWritePackage({
        manifest: result,
        sourceLang,
        targetLang,
        generateAudio: parsed.data.generateAudio,
        generateImages: parsed.data.generateImages,
        userId,
        onProgress: (data) => {
          if (!isClosed) emit(data);
        },
        ttsOverride,
        imageOverride,
      });

      if (isClosed) return;

      emit({
        type: 'complete',
        result: { ...result, packageId: written.packageId, packageSlug: written.slug },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isClosed) {
        console.error('[generate-course] Error:', msg);
        emit({ type: 'error', message: 'Course generation failed' });
      }
    } finally {
      if (!isClosed) {
        isClosed = true;
        writer.close().catch(() => {});
      }
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  });
}
