import { z } from 'zod';

/**
 * Roleplay Pack v1.0 — a portable, user-shareable bundle of vocabulary,
 * scenarios, and personas that biases the Roleplay coach toward a specific
 * domain or community of practice.
 *
 * A pack is a soft constraint: it shapes the AI partner's voice via prompt
 * injection. There is no runtime enforcement — coverageTargets are hints
 * surfaced in analytics, not regen gates.
 */

export const PartOfSpeechSchema = z.enum([
  'verb',
  'noun',
  'adjective',
  'adverb',
  'phrase',
  'idiom',
  'collocation',
  'acronym',
]);

export const RegisterSchema = z.enum(['formal', 'neutral', 'casual', 'slang']);

export const PrioritySchema = z.enum(['must_appear', 'nice_to_have']);

export const CefrLevelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

export const TokenEntrySchema = z.object({
  term: z.string().min(1),
  pos: PartOfSpeechSchema,
  priority: PrioritySchema.default('nice_to_have'),
  register: RegisterSchema.default('neutral'),
  gloss: z.string().min(1),
  sourceLangGloss: z.record(z.string(), z.string()).optional(),
  collocations: z.array(z.string()).default([]),
  contexts: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  pronunciationHint: z.string().optional(),
  cefr: CefrLevelSchema.optional(),
  tags: z.array(z.string()).default([]),
});

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  settings: z.array(z.string()).default([]),
  roles: z.array(z.string()).default([]),
  signature_terms: z.array(z.string()).default([]),
  roleplay_seed: z.string().default(''),
});

export const PersonaSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  formality: RegisterSchema,
  typical_phrases: z.array(z.string()).default([]),
});

export const CoverageTargetsSchema = z.object({
  suggested_terms_per_session: z.number().int().min(0).default(6),
  suggested_per_turn_max: z.number().int().min(0).default(2),
});

export const RoleplayPackSchema = z.object({
  schemaVersion: z.literal('1.0'),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  domain: z.string().min(1),
  targetLang: z.string().min(1),
  authorLang: z.string().min(1),
  ageGroups: z.array(z.string()).default([]),
  author: z.string().optional(),
  license: z.string().default('CC-BY-4.0'),
  homepage: z.string().url().optional(),
  vocabulary: z.array(TokenEntrySchema).min(1),
  scenarios: z.array(ScenarioSchema).default([]),
  personas: z.array(PersonaSchema).default([]),
  avoidTerms: z.array(z.string()).default([]),
  coverageTargets: CoverageTargetsSchema.default({
    suggested_terms_per_session: 6,
    suggested_per_turn_max: 2,
  }),
});

export type RoleplayPack = z.infer<typeof RoleplayPackSchema>;
export type TokenEntry = z.infer<typeof TokenEntrySchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Register = z.infer<typeof RegisterSchema>;
export type PartOfSpeech = z.infer<typeof PartOfSpeechSchema>;
export type CoverageTargets = z.infer<typeof CoverageTargetsSchema>;
