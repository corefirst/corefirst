import { describe, expect, it, vi } from 'vitest';
import { extractSettings, resolveFeatureFromSettings } from '../../src/lib/ai/settings-config';

// Mock the text factory so tests don't need real API keys.
vi.mock('../../src/lib/ai/text/factory', () => ({
  buildTextModelFromSpec: vi.fn((spec) => ({ _mockModel: true, ...spec })),
  registerTextModelBuilder: vi.fn(),
}));

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/test', { headers });
}

describe('extractSettings — per-feature headers', () => {
  it('populates features.transform when x-cf-transform-provider is set', () => {
    const req = makeRequest({ 'x-cf-transform-provider': 'anthropic' });
    const s = extractSettings(req);
    expect(s.features.transform?.provider).toBe('anthropic');
  });

  it('populates features.roleplay when x-cf-roleplay-provider is set', () => {
    const req = makeRequest({
      'x-cf-roleplay-provider': 'ollama',
      'x-cf-roleplay-model': 'llama3.2',
    });
    const s = extractSettings(req);
    expect(s.features.roleplay?.provider).toBe('ollama');
    expect(s.features.roleplay?.model).toBe('llama3.2');
  });

  it('does not populate features entry when provider header is absent', () => {
    const req = makeRequest({ 'x-cf-transform-model': 'gpt-4o' }); // model only, no provider
    const s = extractSettings(req);
    expect(s.features.transform).toBeUndefined();
  });

  it('sets features to empty object when no feature headers present', () => {
    const req = makeRequest({ 'x-cf-provider': 'openai' });
    const s = extractSettings(req);
    expect(Object.keys(s.features)).toHaveLength(0);
  });
});

describe('resolveFeatureFromSettings — per-feature priority', () => {
  it('returns undefined when no client settings provided', () => {
    const req = makeRequest({});
    const s = extractSettings(req);
    expect(resolveFeatureFromSettings('transform', s)).toBeUndefined();
  });

  it('uses per-feature provider over global text provider', () => {
    const req = makeRequest({
      'x-cf-provider': 'openai',
      'x-cf-transform-provider': 'anthropic',
    });
    const s = extractSettings(req);
    const model = resolveFeatureFromSettings('transform', s) as any;
    // Feature-level override wins: anthropic
    expect(model.provider).toBe('anthropic');
  });

  it('falls back to global text when no feature override', () => {
    const req = makeRequest({ 'x-cf-provider': 'openai', 'x-cf-model': 'gpt-4o' });
    const s = extractSettings(req);
    const model = resolveFeatureFromSettings('transform', s) as any;
    expect(model.provider).toBe('openai');
    expect(model.model).toBe('gpt-4o');
  });

  it('uses default text model when feature provider set but no model', () => {
    const req = makeRequest({ 'x-cf-transform-provider': 'anthropic' });
    const s = extractSettings(req);
    const model = resolveFeatureFromSettings('transform', s) as any;
    expect(model.provider).toBe('anthropic');
    expect(model.model).toBe('claude-sonnet-4-6'); // PROVIDER_DEFAULTS.anthropic.text
  });
});
