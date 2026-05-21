import { z } from 'zod';

export const LessonScriptSchema = z.object({
  speaker: z.string(),
  cflt_l1: z.string(),
  cflt_l2: z.string(),
  standard_l2: z.string(),
  standard_l1: z.string().default(''),
  ssml: z.string().default(''),
  audioUrl: z.string().optional(),
  cfltAudioUrl: z.string().optional(),
});

/**
 * Clean schema for LLM generation. 
 * OpenAI Structured Outputs (strict: true) does NOT allow .optional() fields.
 */
export const LessonScriptGenerationSchema = z.object({
  speaker: z.string(),
  cflt_l1: z.string(),
  cflt_l2: z.string(),
  standard_l2: z.string(),
  standard_l1: z.string(),
  ssml: z.string(),
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
  imageUrl: z.string().optional(),
});

export const LessonGenerationSchema = z.object({
  title: z.string(),
  scenario_description: z.string(),
  cflt_scripts: z.array(LessonScriptGenerationSchema),
  visual_generation_prompts: z.array(z.string()),
  vocabulary_focus: z.array(z.object({
    token: z.string(),
    meaning: z.string()
  })),
});

export const CoursewareManifestSchema = z.object({
  age_group: z.string(),
  category_context: z.string(),
  topic: z.string(),
  lessons: z.array(LessonSchema),
});

export const CoursewareGenerationSchema = z.object({
  age_group: z.string(),
  category_context: z.string(),
  topic: z.string(),
  lessons: z.array(LessonGenerationSchema),
});

export type CoursewareManifest = z.infer<typeof CoursewareManifestSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type LessonScript = z.infer<typeof LessonScriptSchema>;
