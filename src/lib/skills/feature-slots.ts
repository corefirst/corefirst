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

export type SkillCategory = 'core' | 'practice' | 'courseware';
export type SkillLevel = 'basic' | 'advanced';

export interface SlotMetadata {
  slot: FeatureSlot;
  category: SkillCategory;
  level: SkillLevel;
}

export const SLOT_METADATA: Record<FeatureSlot, SlotMetadata> = {
  'roleplay-coach':       { slot: 'roleplay-coach',       category: 'practice',   level: 'basic' },
  'speech-eval':          { slot: 'speech-eval',          category: 'practice',   level: 'basic' },
  'sentence-refine':      { slot: 'sentence-refine',      category: 'core',       level: 'basic' },
  'cflt-transformer':     { slot: 'cflt-transformer',     category: 'core',       level: 'advanced' },
  'courseware-gen':       { slot: 'courseware-gen',       category: 'courseware', level: 'advanced' },
  'courseware-repair':    { slot: 'courseware-repair',    category: 'courseware', level: 'advanced' },
  'roleplay-analysis':    { slot: 'roleplay-analysis',    category: 'practice',   level: 'advanced' },
  'speech-eval-user':     { slot: 'speech-eval-user',     category: 'practice',   level: 'advanced' },
  'sentence-refine-user': { slot: 'sentence-refine-user', category: 'core',       level: 'advanced' },
};

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
