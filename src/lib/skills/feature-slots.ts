/** Maps each feature slot to its system-default prompt file. */
export const FEATURE_SLOTS = {
  'cflt-transformer':   'src/core/system_prompt.md',
  'courseware-gen':     'src/generator/courseware_prompt.md',
  'courseware-repair':  'src/generator/repair-instruction.md',
  'roleplay-coach':     'src/prompts/roleplay_base.md',
  'roleplay-analysis':  'src/prompts/roleplay_analysis.md',
  'speech-eval':        'src/prompts/speech-eval.md',
  'speech-eval-user':   'src/prompts/speech-eval-user.md',
  'sentence-refine':    'src/prompts/refine.md',
  'sentence-refine-user': 'src/prompts/refine-user.md',
} as const;

export type FeatureSlot = keyof typeof FEATURE_SLOTS;

export function isFeatureSlot(s: string): s is FeatureSlot {
  return s in FEATURE_SLOTS;
}

/** Human-readable label for display in the skills UI. */
export const SLOT_LABELS: Record<FeatureSlot, string> = {
  'cflt-transformer':     'CFLT Transformer (System)',
  'courseware-gen':       'Courseware Generator (System)',
  'courseware-repair':    'Courseware Repair Instruction',
  'roleplay-coach':       'Roleplay Coach (Base)',
  'roleplay-analysis':    'Roleplay Coach (Analysis)',
  'speech-eval':          'Speech Evaluator (System)',
  'speech-eval-user':     'Speech Evaluator (User Prompt)',
  'sentence-refine':      'Sentence Refine (System)',
  'sentence-refine-user': 'Sentence Refine (User Prompt)',
};
