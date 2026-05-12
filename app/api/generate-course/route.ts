import { z } from 'zod';
import { CoursewareOrchestrator } from '@/src/generator/orchestrator';
import { buildAndWritePackage } from '@/src/generator/package-builder';
import { getUserId } from '@/src/lib/auth/user';
import { extractSettings, resolveFeatureFromSettings } from '@/src/lib/ai/settings-config';

const GenerateCourseRequestSchema = z.object({
  age_group: z.string().min(1),
  industry_context: z.string().min(1),
  topic: z.string().min(1).max(512),
  sourceLang: z.string().optional(),
  targetLang: z.string().optional(),
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

  const emit = (data: object) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  // Run generation asynchronously so we can return the stream immediately
  (async () => {
    try {
      const modelOverride = resolveFeatureFromSettings('courseGen', extractSettings(request));
      const orchestrator = new CoursewareOrchestrator(modelOverride, emit);

      const result = await orchestrator.generate({
        age_group: parsed.data.age_group,
        industry_context: parsed.data.industry_context,
        topic: parsed.data.topic,
        sourceLang,
        targetLang,
      });

      if ('error' in result) {
        emit({ type: 'error', message: 'Course generation failed' });
        return;
      }

      const userId = await getUserId(request);
      const written = await buildAndWritePackage({
        manifest: result,
        sourceLang,
        targetLang,
        generateImages: parsed.data.generateImages,
        userId,
        onProgress: emit,
      });

      emit({
        type: 'complete',
        result: { ...result, packageId: written.packageId, packageSlug: written.slug },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[generate-course] Error:', msg);
      emit({ type: 'error', message: 'Course generation failed' });
    } finally {
      writer.close();
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
