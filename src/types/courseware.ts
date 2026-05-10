import { z } from 'zod';

export const LessonScriptSchema = z.object({
  speaker: z.string(),
  cflt_l1: z.string(),
  cflt_l2: z.string(),
  standard_l2: z.string(),
  // SSML is the most fragile field — `<prosody>` etc. inside a JSON string is
  // a common breakage point for weaker JSON-mode models. Optional w/ default
  // empty string; orchestrator falls back to wrapping standard_l2 if missing.
  ssml: z.string().default(''),
  // UI-only: pre-rendered mp3 served from a stored package. Never produced by
  // the LLM; populated by /api/courses/:slug when loading from history.
  audioUrl: z.string().optional(),
});

export const LessonSchema = z.object({
  title: z.string(),
  scenario_description: z.string(),
  cflt_scripts: z.array(LessonScriptSchema),
  visual_generation_prompts: z.array(z.string()),
  vocabulary_focus: z.array(z.object({
    token: z.string(),
    meaning: z.string()
  })),
  // UI-only: pre-rendered scene image (.webp) from a stored package.
  imageUrl: z.string().optional(),
});

export const CoursewareManifestSchema = z.object({
  age_group: z.string(),
  industry_context: z.string(),
  topic: z.string(),
  lessons: z.array(LessonSchema),
});

export type CoursewareManifest = z.infer<typeof CoursewareManifestSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type LessonScript = z.infer<typeof LessonScriptSchema>;
