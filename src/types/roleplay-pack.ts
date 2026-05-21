import { z } from 'zod';

/**
 * Roleplay Pack v2.0 — a named, shareable prompt preset for the Roleplay coach.
 *
 * A pack is essentially a custom system prompt injection: the user writes what
 * they want the coach to do, and it gets inserted into the base roleplay prompt.
 * sourceLang is stored for backend sync and analytics.
 */

export const RoleplayPackSchema = z.object({
  schemaVersion: z.literal('2.0'),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  category: z.string().min(1),
  sourceLang: z.string().min(1),
  prompt: z.string().min(1),
  defaultInputMode: z.enum(['free', 'crst']).default('free'),
});

export type RoleplayPack = z.infer<typeof RoleplayPackSchema>;
