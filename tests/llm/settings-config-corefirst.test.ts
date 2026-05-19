import { describe, expect, it, vi } from 'vitest';
import {
  extractSettings,
  resolveTextModel,
  resolveTTSOverride,
  resolveSTTOverride,
  resolveImageOverride,
} from '../../src/lib/ai/settings-config';

vi.mock('../../src/lib/ai/text/factory', () => ({
  buildTextModelFromSpec: vi.fn((spec) => ({ _mockModel: true, ...spec })),
  registerTextModelBuilder: vi.fn(),
}));

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/test', { headers });
}

const CLOUD_HEADERS = {
  'x-cf-provider':       'corefirst',
  'x-cf-cloud-token':    'bearer-abc',
  'x-cf-cloud-base-url': 'http://localhost:4000',
};

describe('extractSettings — corefirst cloud provider', () => {
  it('reads x-cf-cloud-token into cloudToken', () => {
    const s = extractSettings(makeRequest(CLOUD_HEADERS));
    expect(s.cloudToken).toBe('bearer-abc');
  });

  it('reads x-cf-cloud-base-url into cloudBaseUrl', () => {
    const s = extractSettings(makeRequest(CLOUD_HEADERS));
    expect(s.cloudBaseUrl).toBe('http://localhost:4000');
  });

  it('cloudToken is empty string when header absent', () => {
    const s = extractSettings(makeRequest({ 'x-cf-provider': 'openai' }));
    expect(s.cloudToken).toBe('');
  });
});

describe('resolveTextModel — corefirst provider', () => {
  it('uses cloudToken as apiKey and constructs /v1/ai baseUrl', () => {
    const s = extractSettings(makeRequest(CLOUD_HEADERS));
    const model = resolveTextModel(s) as any;
    expect(model.provider).toBe('corefirst');
    expect(model.apiKey).toBe('bearer-abc');
    expect(model.baseUrl).toBe('http://localhost:4000/v1/ai');
  });

  it('strips trailing slash from cloudBaseUrl before appending /v1/ai', () => {
    const s = extractSettings(makeRequest({
      ...CLOUD_HEADERS,
      'x-cf-cloud-base-url': 'http://localhost:4000/',
    }));
    const model = resolveTextModel(s) as any;
    expect(model.baseUrl).toBe('http://localhost:4000/v1/ai');
  });

  it('returns undefined when corefirst has no cloudToken', () => {
    const s = extractSettings(makeRequest({
      'x-cf-provider':       'corefirst',
      'x-cf-cloud-base-url': 'http://localhost:4000',
      // no x-cf-cloud-token
    }));
    const model = resolveTextModel(s) as any;
    // cloudToken is empty → apiKey resolves to undefined → undefined returned
    expect(model?.apiKey ?? undefined).toBeUndefined();
  });
});

describe('resolveTTSOverride — corefirst provider', () => {
  it('returns undefined when cloudToken is absent', () => {
    const s = extractSettings(makeRequest({
      'x-cf-tts-provider':   'corefirst',
      'x-cf-cloud-base-url': 'http://localhost:4000',
    }));
    expect(resolveTTSOverride(s)).toBeUndefined();
  });

  it('returns override with cloud token as apiKey when both headers present', () => {
    const s = extractSettings(makeRequest({
      'x-cf-provider':       'corefirst',
      'x-cf-cloud-token':    'tok',
      'x-cf-cloud-base-url': 'http://localhost:4000',
    }));
    const tts = resolveTTSOverride(s);
    expect(tts?.apiKey).toBe('tok');
    expect(tts?.baseUrl).toBe('http://localhost:4000/v1/ai');
  });
});

describe('resolveSTTOverride — corefirst provider', () => {
  it('returns undefined when cloudToken is absent', () => {
    const s = extractSettings(makeRequest({
      'x-cf-stt-provider':   'corefirst',
      'x-cf-cloud-base-url': 'http://localhost:4000',
    }));
    expect(resolveSTTOverride(s)).toBeUndefined();
  });

  it('returns override with cloud token when headers complete', () => {
    const s = extractSettings(makeRequest({
      'x-cf-provider':       'corefirst',
      'x-cf-cloud-token':    'tok',
      'x-cf-cloud-base-url': 'http://localhost:4000',
    }));
    const stt = resolveSTTOverride(s);
    expect(stt?.apiKey).toBe('tok');
  });
});

describe('resolveImageOverride — corefirst provider', () => {
  it('returns undefined when cloudToken is absent', () => {
    const s = extractSettings(makeRequest({
      'x-cf-image-provider': 'corefirst',
      'x-cf-cloud-base-url': 'http://localhost:4000',
    }));
    expect(resolveImageOverride(s)).toBeUndefined();
  });

  it('returns override with cloud token when headers complete', () => {
    const s = extractSettings(makeRequest({
      'x-cf-provider':       'corefirst',
      'x-cf-cloud-token':    'tok',
      'x-cf-cloud-base-url': 'http://localhost:4000',
    }));
    const img = resolveImageOverride(s);
    expect(img?.apiKey).toBe('tok');
    expect(img?.baseUrl).toBe('http://localhost:4000/v1/ai');
  });
});
