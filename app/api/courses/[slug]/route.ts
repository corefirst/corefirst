import { NextResponse } from 'next/server';
import { readPackageManifest, PackageNotFoundError } from '@/src/lib/storage';

interface Params { slug: string }

// Returns a stored package mapped into the LLM-facing CoursewareManifest
// shape so the existing course UI can consume it without branching.
// Storage uses camelCase (`cfltL1`, `standardL2`); the UI expects snake_case
// (`cflt_l1`, `standard_l2`) — we adapt here, not in the component.
export async function GET(_request: Request, ctx: { params: Promise<Params> }) {
  const { slug } = await ctx.params;
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

  try {
    const manifest = await readPackageManifest(slug);
    const courseware = {
      age_group: manifest.ageGroup,
      industry_context: manifest.industry,
      topic: manifest.topic,
      lessons: manifest.lessons.map((lesson) => ({
        title: lesson.title,
        scenario_description: lesson.scenario_desc,
        vocabulary_focus: lesson.vocabulary_focus,
        visual_generation_prompts: lesson.visual_generation_prompts,
        // The package stores a pre-rendered .webp per lesson at images/l{i}.webp.
        // Surface a stable URL so the UI can render it directly instead of
        // re-running the image model. UI falls back to the prompt-based
        // generator when imageUrl is absent (live mode).
        imageUrl: `/api/courses/${encodeURIComponent(slug)}/image/${lesson.lessonIndex}`,
        cflt_scripts: lesson.scripts.map((s) => ({
          speaker: s.speaker,
          cflt_l1: s.cfltL1,
          cflt_l2: s.cfltL2,
          standard_l2: s.standardL2,
          ssml: s.ssml,
          audioUrl: `/api/courses/${encodeURIComponent(slug)}/audio/${lesson.lessonIndex}/${s.scriptIndex}`,
        })),
      })),
      packageId: manifest.packageId,
      packageSlug: manifest.slug,
    };
    return NextResponse.json(courseware);
  } catch (err) {
    if (err instanceof PackageNotFoundError) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[courses/:slug] Error:', msg);
    return NextResponse.json({ error: 'Failed to read course' }, { status: 500 });
  }
}
