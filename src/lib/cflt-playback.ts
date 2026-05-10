import type { CFLTResponse } from '../types/cflt';

export type SlotFill = { l1: string; l2: string; source: 'suggested' | 'typed' };
export type SlotFillMap = Partial<Record<'core' | 'reason' | 'space' | 'time', SlotFill | null>>;

/**
 * Build the playable CFLT sentence for TTS. Rule applied uniformly to all
 * four slots (Core / Reason / Space / Time):
 *
 *   - User-supplied slot (`is_inferred=false`) → include the slot content.
 *   - Inferred slot WITH a user fill → include the user's fill.
 *   - Inferred slot WITHOUT a user fill → DROP. We never play the model's
 *     guess; the learner has to engage with the gap before the audio includes
 *     it (matches the visual UX where inferred-empty slots are dashed).
 *
 * When `result.slots` is missing (legacy responses), falls back to the raw
 * `cflt_l1` / `cflt_l2` string.
 */
export function buildPlayableCflt(
  result: CFLTResponse,
  fills: SlotFillMap,
  lang: 'l1' | 'l2',
): string {
  if (!result.slots) return lang === 'l1' ? result.cflt_l1 : result.cflt_l2;
  return result.slots
    .map((s) => {
      if (!s.is_inferred) return lang === 'l1' ? s.content_l1 : s.content_l2;
      const fill = fills[s.type];
      if (!fill) return '';
      return lang === 'l1' ? fill.l1 : fill.l2;
    })
    .filter(Boolean)
    .join(', ');
}
