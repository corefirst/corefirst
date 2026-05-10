import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CFLTTransformer } from '../src/core/transformer';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  NoObjectGeneratedError: class NoObjectGeneratedError extends Error {
    text: string;
    constructor(msg = '', text = '') { super(msg); this.text = text; }
    static isInstance(e: unknown): e is { text: string } {
      return e instanceof Error && 'text' in e;
    }
  },
}));

import { generateObject } from 'ai';

const goodResponse = {
  is_cflt_compliant: true,
  cflt_l1: '我去商店，买东西，在市中心，今天。',
  cflt_l2: 'I go to the store, to shop, downtown, today.',
  standard_l2: 'I go to the store downtown to shop today.',
  standard_l1: '我今天去市中心的商店购物。',
  corrections: [],
};

describe('CFLTTransformer', () => {
  let transformer: CFLTTransformer;

  beforeEach(() => {
    vi.clearAllMocks();
    transformer = new CFLTTransformer();
  });

  it('returns a CFLTResponse on success', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({ object: goodResponse } as any);
    const result = await transformer.transform('I go to the store today.');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.is_cflt_compliant).toBe(true);
      expect(result.standard_l2).toBe('I go to the store downtown to shop today.');
    }
  });

  it('returns an error object when generateObject throws', async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('API timeout'));
    const result = await transformer.transform('test');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('API timeout');
      expect(typeof result.raw).toBe('string');
    }
  });

  it('defaults sourceLang to Chinese and targetLang to English', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({ object: goodResponse } as any);
    await transformer.transform('hello');
    const [call] = vi.mocked(generateObject).mock.calls;
    expect((call[0] as any).system).toContain('Chinese');
    expect((call[0] as any).system).toContain('English');
  });

  it('injects custom source and target languages into the system prompt', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({ object: goodResponse } as any);
    await transformer.transform('hello', 'Japanese', 'Spanish');
    const [call] = vi.mocked(generateObject).mock.calls;
    expect((call[0] as any).system).toContain('Japanese');
    expect((call[0] as any).system).toContain('Spanish');
  });
});
