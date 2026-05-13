import { loadPrompt } from '@/src/lib/prompts/loader';
import { FEATURE_SLOTS, type FeatureSlot } from './feature-slots';
import { getSkillPreferences, getSkillById } from './store';

/**
 * Resolve and render a skill for a given feature slot.
 *
 * Resolution order:
 *   1. User's active skill preference (if userId provided and preference exists)
 *   2. System default prompt file (always available, no DB required)
 *
 * This keeps existing behavior intact for unauthenticated or internal callers
 * while enabling per-user customization for authenticated requests.
 */
export async function loadSkill(
  slot: FeatureSlot,
  vars: Record<string, string> = {},
  userId?: string,
): Promise<string> {
  if (userId) {
    try {
      const prefs = await getSkillPreferences(userId);
      const skillId = prefs[slot];
      if (skillId) {
        const skill = await getSkillById(userId, skillId);
        if (skill) {
          return substituteVars(skill.content, vars);
        }
      }
    } catch {
      // DB unavailable — fall through to system default silently.
    }
  }
  return loadPrompt(FEATURE_SLOTS[slot], vars);
}

/** Apply {{KEY}} substitution — same semantics as loadPrompt. */
function substituteVars(template: string, vars: Record<string, string>): string {
  let text = template;
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, () => value);
  }
  return text;
}
