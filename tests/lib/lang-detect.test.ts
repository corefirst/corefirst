import { describe, it, expect } from 'vitest';
import { detectScript, expectedScript, verifyL1L2 } from '@/src/lib/utils/lang-detect';

describe('detectScript', () => {
  it('identifies Chinese as CJK', () => {
    expect(detectScript('我们考虑样本大小，为了确保统计显著性。')).toBe('cjk');
  });

  it('identifies English as Latin', () => {
    expect(detectScript('We should consider the sample size to ensure statistical significance.')).toBe('latin');
  });

  it('identifies Japanese (kana present) over CJK even with kanji', () => {
    expect(detectScript('東京で本を読みます')).toBe('hiragana-katakana');
  });

  it('identifies Korean as Hangul', () => {
    expect(detectScript('보고서를 마무리합니다')).toBe('hangul');
  });

  it('returns unknown for punctuation-only input', () => {
    expect(detectScript('，。!!! 123 ')).toBe('unknown');
  });

  it('handles mixed text by dominant script', () => {
    // Mostly Chinese with a stray English token — should still classify as CJK.
    expect(detectScript('我们使用 Python 进行分析')).toBe('cjk');
  });
});

describe('expectedScript', () => {
  it('maps common language names to scripts', () => {
    expect(expectedScript('Chinese')).toBe('cjk');
    expect(expectedScript('English')).toBe('latin');
    expect(expectedScript('Japanese')).toBe('hiragana-katakana');
    expect(expectedScript('Korean')).toBe('hangul');
    expect(expectedScript('Russian')).toBe('cyrillic');
    expect(expectedScript('Arabic')).toBe('arabic');
    expect(expectedScript('Spanish')).toBe('latin');
  });

  it('is case-insensitive and accepts ISO codes', () => {
    expect(expectedScript('chinese')).toBe('cjk');
    expect(expectedScript('zh')).toBe('cjk');
    expect(expectedScript('en')).toBe('latin');
  });

  it('returns unknown for unsupported languages', () => {
    expect(expectedScript('Klingon')).toBe('unknown');
  });
});

describe('verifyL1L2', () => {
  it('swaps when L1/L2 are clearly reversed (Chinese ↔ English)', () => {
    // This is the exact bug observed in lesson 0 / scriptIndex 3.
    const result = verifyL1L2(
      'We consider the sample size, to ensure statistical significance, in the analysis, now.',
      '我们考虑样本大小, 为了确保统计显著性, 在分析中, 现在。',
      'Chinese',
      'English',
    );
    expect(result.swapped).toBe(true);
    expect(result.l1).toBe('我们考虑样本大小, 为了确保统计显著性, 在分析中, 现在。');
    expect(result.l2).toBe('We consider the sample size, to ensure statistical significance, in the analysis, now.');
  });

  it('does NOT swap when L1/L2 are correctly aligned', () => {
    const result = verifyL1L2(
      '我们应该使用定量研究方法',
      'We should use quantitative research methods',
      'Chinese',
      'English',
    );
    expect(result.swapped).toBe(false);
    expect(result.l1).toBe('我们应该使用定量研究方法');
    expect(result.l2).toBe('We should use quantitative research methods');
  });

  it('does NOT swap when both languages share a script (e.g., English ↔ Spanish)', () => {
    // Conservative: shared-script pairs can't be reliably checked by Unicode block.
    const result = verifyL1L2(
      'Hello world',
      'Hola mundo',
      'English',
      'Spanish',
    );
    expect(result.swapped).toBe(false);
  });

  it('does NOT swap when one language is unknown', () => {
    const result = verifyL1L2('text one', 'text two', 'Klingon', 'English');
    expect(result.swapped).toBe(false);
  });

  it('does NOT swap when the pair is partially malformed (both look like same script)', () => {
    // If both strings are CJK, we can't tell which is the SOURCE half — leave untouched.
    const result = verifyL1L2('中文一', '中文二', 'Chinese', 'English');
    expect(result.swapped).toBe(false);
  });

  it('handles Japanese ↔ English reversal', () => {
    const result = verifyL1L2(
      'I read a book',
      '本を読みます',
      'Japanese',
      'English',
    );
    expect(result.swapped).toBe(true);
    expect(result.l1).toBe('本を読みます');
    expect(result.l2).toBe('I read a book');
  });
});
