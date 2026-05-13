import type { FEATURE_SLOTS } from './feature-slots';

export type FeatureSlot = keyof typeof FEATURE_SLOTS;

export interface SkillVar {
  key: string;
  label: string;
  description?: string;
}

/** Stored in PouchDB. _id = "skill:{uuid}" or "skill:system:{slot}" */
export interface SkillDoc {
  featureSlot: string;
  name: string;
  description: string;
  /** Prompt template using {{VAR}} placeholders (Claude Skills syntax). */
  content: string;
  vars: SkillVar[];
  tags: string[];
  isSystem: boolean;
  authorId: string;
  visibility: 'private' | 'public';
  /** Id of the skill this was forked from, null if original. */
  forkOf: string | null;
  likes: number;
  forks: number;
  createdAt: string;
  updatedAt?: string;
}

export interface SkillWithId extends SkillDoc {
  _id: string;
}

/** Single preference document per user: maps featureSlot → active skillId. */
export interface SkillPrefsDoc {
  /** featureSlot → skillId. If slot is absent, system default is used. */
  prefs: Record<string, string>;
}
