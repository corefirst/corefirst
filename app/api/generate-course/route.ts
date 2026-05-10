import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CoursewareOrchestrator } from '@/src/generator/orchestrator';
import { buildAndWritePackage } from '@/src/generator/package-builder';

const GenerateCourseRequestSchema = z.object({
  age_group: z.string().min(1),
  industry_context: z.string().min(1),
  topic: z.string().min(1).max(512),
  sourceLang: z.string().optional(),
  targetLang: z.string().optional(),
  generateImages: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = GenerateCourseRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const sourceLang = parsed.data.sourceLang || 'Chinese';
    const targetLang = parsed.data.targetLang || 'English';

    const orchestrator = new CoursewareOrchestrator();
    const result = await orchestrator.generate({
      age_group: parsed.data.age_group,
      industry_context: parsed.data.industry_context,
      topic: parsed.data.topic,
      sourceLang,
      targetLang,
    });

    if ('error' in result) {
      console.error('[generate-course] Orchestrator error:', result.error);
      return NextResponse.json({ error: 'Course generation failed' }, { status: 500 });
    }

    const written = await buildAndWritePackage({
      manifest: result,
      sourceLang,
      targetLang,
      generateImages: parsed.data.generateImages,
    });

    return NextResponse.json({
      ...result,
      packageId: written.packageId,
      packageSlug: written.slug,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[generate-course] Error:', msg);
    return NextResponse.json({ error: 'Course generation failed' }, { status: 500 });
  }
}
