import { describe, it, expect } from 'vitest';
import { buildPlayableCflt, type SlotFillMap } from '@/src/lib/cflt-playback';
import type { CFLTResponse, CfltSlot } from '@/src/types/cflt';

// Convenience builder for a 4-slot CFLT response. Defaults each slot to a
// user-supplied (non-inferred) value with a stable string we can assert on.
function makeResult(overrides: Partial<Record<CfltSlot['type'], Partial<CfltSlot>>> = {}): CFLTResponse {
  const types: CfltSlot['type'][] = ['core', 'reason', 'space', 'time'];
  const slots = types.map<CfltSlot>((type) => ({
    type,
    content_l1: `${type}-l1`,
    content_l2: `${type}-l2`,
    is_inferred: false,
    suggestions: [],
    ...overrides[type],
  })) as [CfltSlot, CfltSlot, CfltSlot, CfltSlot];
  return {
    is_cflt_compliant: true,
    cflt_l1: 'core-l1, reason-l1, space-l1, time-l1',
    cflt_l2: 'core-l2, reason-l2, space-l2, time-l2',
    standard_l2: 'standard',
    standard_l1: 'standard',
    corrections: [],
    slots,
  };
}

describe('buildPlayableCflt — CRST drop rule', () => {
  it('keeps every slot when none are inferred', () => {
    const result = makeResult();
    expect(buildPlayableCflt(result, {}, 'l2')).toBe('core-l2, reason-l2, space-l2, time-l2');
    expect(buildPlayableCflt(result, {}, 'l1')).toBe('core-l1, reason-l1, space-l1, time-l1');
  });

  it.each(['core', 'reason', 'space', 'time'] as const)(
    'drops inferred %s when the user has not filled it',
    (slot) => {
      const result = makeResult({ [slot]: { is_inferred: true } });
      const others = (['core', 'reason', 'space', 'time'] as const).filter((t) => t !== slot);
      const expected = others.map((t) => `${t}-l2`).join(', ');
      expect(buildPlayableCflt(result, {}, 'l2')).toBe(expected);
    },
  );

  it.each(['core', 'reason', 'space', 'time'] as const)(
    'includes the user fill for an inferred %s when supplied',
    (slot) => {
      const result = makeResult({ [slot]: { is_inferred: true } });
      const fills: SlotFillMap = { [slot]: { l1: 'picked-l1', l2: 'picked-l2', source: 'suggested' } };
      const segments = (['core', 'reason', 'space', 'time'] as const).map((t) =>
        t === slot ? 'picked-l2' : `${t}-l2`,
      );
      expect(buildPlayableCflt(result, fills, 'l2')).toBe(segments.join(', '));
    },
  );

  it('drops an inferred slot whose fill is explicitly null (cleared)', () => {
    const result = makeResult({ reason: { is_inferred: true } });
    const fills: SlotFillMap = { reason: null };
    expect(buildPlayableCflt(result, fills, 'l2')).toBe('core-l2, space-l2, time-l2');
  });

  it('drops every slot when all are inferred and unfilled', () => {
    const result = makeResult({
      core: { is_inferred: true },
      reason: { is_inferred: true },
      space: { is_inferred: true },
      time: { is_inferred: true },
    });
    expect(buildPlayableCflt(result, {}, 'l2')).toBe('');
  });

  it('uses the user fill in the requested language', () => {
    const result = makeResult({ time: { is_inferred: true } });
    const fills: SlotFillMap = { time: { l1: 'tonight', l2: 'cong-jin-wan', source: 'typed' } };
    expect(buildPlayableCflt(result, fills, 'l1')).toBe('core-l1, reason-l1, space-l1, tonight');
    expect(buildPlayableCflt(result, fills, 'l2')).toBe('core-l2, reason-l2, space-l2, cong-jin-wan');
  });

  it('falls back to raw cflt_l1 / cflt_l2 when slots are absent (legacy responses)', () => {
    const legacy: CFLTResponse = {
      is_cflt_compliant: true,
      cflt_l1: 'a, b, c, d',
      cflt_l2: 'w, x, y, z',
      standard_l2: 'standard',
      standard_l1: 'standard',
      corrections: [],
    };
    expect(buildPlayableCflt(legacy, {}, 'l1')).toBe('a, b, c, d');
    expect(buildPlayableCflt(legacy, {}, 'l2')).toBe('w, x, y, z');
  });
});
