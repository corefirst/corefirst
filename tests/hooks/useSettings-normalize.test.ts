import { describe, it, expect } from 'vitest';
import { normalize } from '@/hooks/useSettings';

describe('normalize — legacy localStorage migration', () => {
  it('returns EMPTY_SETTINGS for null/undefined/non-object', () => {
    expect(normalize(null).mode).toBe('standard');
    expect(normalize(undefined).mode).toBe('standard');
    expect(normalize('string').mode).toBe('standard');
    expect(normalize(42).mode).toBe('standard');
  });

  it('preserves explicit mode field when present', () => {
    expect(normalize({ mode: 'advanced', global: {}, advanced: {} }).mode).toBe('advanced');
    expect(normalize({ mode: 'standard', global: {}, advanced: {} }).mode).toBe('standard');
  });

  it('infers advanced mode from non-empty advanced overrides in legacy payload (no mode field)', () => {
    const legacy = {
      global: { provider: 'openai', apiKey: 'sk-x', model: '' },
      advanced: { tts: { provider: 'openai', baseUrl: 'http://localhost:8880/v1' } },
    };
    expect(normalize(legacy).mode).toBe('advanced');
  });

  it('infers standard mode from empty advanced object in legacy payload', () => {
    const legacy = {
      global: { provider: 'openai', apiKey: 'sk-x', model: '' },
      advanced: {},
    };
    expect(normalize(legacy).mode).toBe('standard');
  });

  it('infers standard mode when advanced keys exist but all values are empty objects', () => {
    const legacy = {
      global: { provider: 'google', apiKey: 'AIza', model: '' },
      advanced: { tts: {}, stt: {} },
    };
    expect(normalize(legacy).mode).toBe('standard');
  });

  it('fills in missing global fields with empty strings', () => {
    const result = normalize({ mode: 'standard' });
    expect(result.global).toEqual({ provider: '', apiKey: '', model: '', ttsModel: '', sttModel: '', imageModel: '' });
  });

  it('preserves existing global fields', () => {
    const raw = { mode: 'standard', global: { provider: 'qwen', apiKey: 'sk-q', model: 'qwen-plus' } };
    const result = normalize(raw);
    expect(result.global.provider).toBe('qwen');
    expect(result.global.apiKey).toBe('sk-q');
  });

  it('returns empty advanced when absent', () => {
    expect(normalize({ mode: 'standard', global: {} }).advanced).toEqual({});
  });
});
