import { describe, expect, it } from 'vitest';
import { validatePromptTemplate } from '../../../src/lib/prompts/loader';

describe('validatePromptTemplate', () => {
  it('returns valid=true when all declared vars are provided', () => {
    const result = validatePromptTemplate('Hello {{NAME}} in {{LANG}}.', {
      NAME: 'Alice',
      LANG: 'English',
    });
    expect(result.valid).toBe(true);
    expect(result.declared).toEqual(['NAME', 'LANG']);
    expect(result.missing).toEqual([]);
    expect(result.unused).toEqual([]);
    expect(result.malformed).toEqual([]);
  });

  it('reports missing vars when caller omits a declared placeholder', () => {
    const result = validatePromptTemplate('{{SOURCE_LANG}} to {{TARGET_LANG}}', {
      SOURCE_LANG: 'Chinese',
    });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('TARGET_LANG');
  });

  it('reports unused vars when caller passes extra keys', () => {
    const result = validatePromptTemplate('Hello {{NAME}}.', {
      NAME: 'Bob',
      EXTRA: 'oops',
    });
    expect(result.unused).toContain('EXTRA');
    // unused alone does not make valid=false
    expect(result.valid).toBe(true);
  });

  it('detects unclosed {{ as malformed', () => {
    const result = validatePromptTemplate('Hello {{ broken', {});
    expect(result.valid).toBe(false);
    expect(result.malformed.length).toBeGreaterThan(0);
  });

  it('detects stray }} as malformed', () => {
    const result = validatePromptTemplate('Hello }} world', {});
    expect(result.valid).toBe(false);
    expect(result.malformed.length).toBeGreaterThan(0);
  });

  it('treats no-variable template as valid with empty vars', () => {
    const result = validatePromptTemplate('No placeholders here.', {});
    expect(result.valid).toBe(true);
    expect(result.declared).toEqual([]);
  });

  it('deduplicates repeated placeholders in declared list', () => {
    const result = validatePromptTemplate('{{X}} and {{X}} again.', { X: '1' });
    expect(result.declared).toEqual(['X']);
  });

  it('handles mixed valid and invalid lines', () => {
    const template = '{{VALID}} is fine\n{{ not closed';
    const result = validatePromptTemplate(template, { VALID: 'ok' });
    expect(result.valid).toBe(false);
    expect(result.malformed.length).toBeGreaterThan(0);
    expect(result.declared).toContain('VALID');
  });
});
