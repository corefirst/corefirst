export { loadSkill } from './loader';
export { FEATURE_SLOTS, SLOT_LABELS, isFeatureSlot, type FeatureSlot } from './feature-slots';
export {
  // Personal skill CRUD
  createSkill,
  updateSkill,
  deleteSkill,
  getUserSkills,
  getSkillById,
  getSkillPreferences,
  setSkillPreference,
  // Community — backend ready, UI hidden until corefirst-world integration
  publishSkill,
  forkSkill,
  likeSkill,
  listCommunitySkills,
  seedSystemSkill,
  systemSkillId,
} from './store';
export type { SkillDoc, SkillWithId, SkillVar, SkillPrefsDoc } from './types';
