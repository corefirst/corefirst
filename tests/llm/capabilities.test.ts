import { describe, expect, it } from 'vitest';
import {
  getDefaultTextModel,
  PROVIDERS_BY_CAPABILITY,
  PROVIDER_DEFAULTS,
  isFullStackProvider,
} from '../../src/lib/ai/capabilities';

describe('getDefaultTextModel', () => {
  it('returns text model for known providers', () => {
    expect(getDefaultTextModel('google')).toBe('gemini-2.5-pro');
    expect(getDefaultTextModel('openai')).toBe('gpt-4o');
    expect(getDefaultTextModel('anthropic')).toBe('claude-sonnet-4-6');
    expect(getDefaultTextModel('groq')).toBe('llama-3.3-70b-versatile');
    expect(getDefaultTextModel('ollama')).toBe('llama3.2');
    expect(getDefaultTextModel('deepseek')).toBe('deepseek-chat');
  });

  it('returns empty string for unknown provider', () => {
    expect(getDefaultTextModel('unknown-provider')).toBe('');
  });

  it('cli providers return their command name', () => {
    expect(getDefaultTextModel('cli/claude')).toBe('claude');
    expect(getDefaultTextModel('cli/gemini')).toBe('gemini');
  });
});

describe('PROVIDERS_BY_CAPABILITY consistency', () => {
  it('groq is listed in text capability', () => {
    expect(PROVIDERS_BY_CAPABILITY.text).toContain('groq');
  });

  it('every provider with PROVIDER_DEFAULTS text entry is in text capability list', () => {
    const textCapList = PROVIDERS_BY_CAPABILITY.text;
    for (const [provider, defaults] of Object.entries(PROVIDER_DEFAULTS)) {
      if (defaults.text) {
        expect(textCapList, `${provider} has text default but missing from PROVIDERS_BY_CAPABILITY.text`)
          .toContain(provider);
      }
    }
  });
});

describe('isFullStackProvider', () => {
  it('google and openai qualify as full-stack', () => {
    expect(isFullStackProvider('google')).toBe(true);
    expect(isFullStackProvider('openai')).toBe(true);
  });

  it('text-only providers do not qualify as full-stack', () => {
    expect(isFullStackProvider('anthropic')).toBe(false);
    expect(isFullStackProvider('groq')).toBe(false);
    expect(isFullStackProvider('deepseek')).toBe(false);
  });

  it('unknown provider returns false', () => {
    expect(isFullStackProvider('nonexistent')).toBe(false);
  });
});
