import { z } from 'zod';

export const CorrectionSchema = z.object({
  type: z.string(), // Changed from enum to string for better model compatibility
  original: z.string(),
  replacement: z.string(),
  reason: z.string(),
});

export const SlotSuggestionSchema = z.object({
  value_l1: z.string(),
  value_l2: z.string(),
  rationale: z.string(),
});

// Per-slot structured representation for the transform UI. Lets the learner
// see which slots were actually present in their input vs. which were filled
// in by the model — and pick / type their own fill for the missing ones.
export const CflmSlotSchema = z.object({
  type: z.enum(['core', 'reason', 'space', 'time']),
  content_l1: z.string(),
  content_l2: z.string(),
  // True when this slot was NOT present in the user's input and the model
  // had to guess. The UI hides the guess and shows an empty slot + suggestions
  // so the learner has to engage with the gap (per CFLT pedagogy).
  is_inferred: z.boolean(),
  // Populated when is_inferred=true: 1-3 candidate fills with rationale.
  suggestions: z.array(SlotSuggestionSchema),
});

export const CFLTResponseSchema = z.object({
  is_cflt_compliant: z.boolean(),
  cflt_l1: z.string(),
  cflt_l2: z.string(),
  standard_l2: z.string(),
  standard_l1: z.string(),
  corrections: z.array(CorrectionSchema),
  // Optional for backward-compat with legacy consumers (course audit etc.)
  // that don't surface per-slot UX. Transform UI requires it.
  slots: z.array(CflmSlotSchema).length(4).optional(),
});

export type CFLTResponse = z.infer<typeof CFLTResponseSchema>;
export type Correction = z.infer<typeof CorrectionSchema>;
export type CfltSlot = z.infer<typeof CflmSlotSchema>;
export type SlotSuggestion = z.infer<typeof SlotSuggestionSchema>;
