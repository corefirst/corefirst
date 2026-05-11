import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  readPackageManifest,
  deletePackage,
  renamePackageTopic,
  PackageNotFoundError,
} from '@/src/lib/storage';
import { getUserId } from '@/src/lib/auth/user';

interface Params { slug: string }

// Slug is the join key for every per-user manifest file, state doc, and
// event doc. It originates from `buildSlug` which only emits `[a-z0-9-]`.
// Anything else arriving at a route handler is either malformed or hostile
// — most importantly, `..` segments would flow into `path.join(packagesDir,
// `${slug}.json`)` and escape the user's data directory, letting a caller
// delete or rename arbitrary `.json` / `.corefirst` files anywhere on disk.
// Reject early so no storage call ever sees a tainted slug.
const SLUG_RE = /^[a-z0-9-]+$/;
function invalidSlug(slug: string): boolean {
  return !slug || !SLUG_RE.test(slug);
}

// Returns a stored package mapped into the LLM-facing CoursewareManifest
// shape so the existing course UI can consume it without branching.
// Storage uses camelCase (`cfltL1`, `standardL2`); the UI expects snake_case
// (`cflt_l1`, `standard_l2`) — we adapt here, not in the component.
export async function GET(request: Request, ctx: { params: Promise<Params> }) {
  const { slug } = await ctx.params;
  if (invalidSlug(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });

  try {
    const userId = await getUserId(request);
    const manifest = await readPackageManifest(userId, slug);
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
          standard_l1: s.standardL1 ?? '',
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

/**
 * DELETE /api/courses/[slug]
 *
 * Removes the manifest, state doc, all event docs for this slug, and runs the
 * CAS media GC. Vocabulary entries from this slug stay but have their
 * `firstSeenIn` link cleared — mastery progress is preserved.
 */
export async function DELETE(request: Request, ctx: { params: Promise<Params> }) {
  const { slug } = await ctx.params;
  if (invalidSlug(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  try {
    const userId = await getUserId(request);
    const result = await deletePackage(userId, slug);
    // Partial cascade — return 207 Multi-Status with the per-step outcome so
    // clients (and ops) can see which step(s) failed without grepping logs.
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, steps: result.steps, errors: result.errors },
        { status: 207 },
      );
    }
    return NextResponse.json({ ok: true, steps: result.steps });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[courses/:slug DELETE] Error:', msg);
    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
  }
}

const PatchBody = z.object({ topic: z.string().min(1).max(200) });

/**
 * PATCH /api/courses/[slug]
 *   body: { topic: string }
 *
 * Renames the course's display topic. Slug is immutable — it's the join key
 * for every event document and renaming it would orphan all history.
 */
export async function PATCH(request: Request, ctx: { params: Promise<Params> }) {
  const { slug } = await ctx.params;
  if (invalidSlug(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  try {
    const body = await request.json();
    const parsed = PatchBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    const userId = await getUserId(request);
    await renamePackageTopic(userId, slug, parsed.data.topic);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PackageNotFoundError) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[courses/:slug PATCH] Error:', msg);
    return NextResponse.json({ error: 'Failed to rename course' }, { status: 500 });
  }
}
