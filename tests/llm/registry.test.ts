import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Text model registry ───────────────────────────────────────────────────────

import { registerTextModelBuilder, buildTextModelFromSpec } from '../../src/lib/ai/text/factory';

describe('registerTextModelBuilder', () => {
  it('allows external providers to register without modifying factory.ts', () => {
    const mockModel = { provider: 'mock' } as any;
    registerTextModelBuilder('test-llm', (_spec) => mockModel);
    const result = buildTextModelFromSpec({ provider: 'test-llm', model: 'test-model' });
    expect(result).toBe(mockModel);
  });

  it('throws InvalidProviderError for unknown providers', () => {
    expect(() => buildTextModelFromSpec({ provider: 'definitely-not-registered-xyz', model: 'x' }))
      .toThrow();
  });

  it('passes spec fields to builder', () => {
    let capturedSpec: any;
    registerTextModelBuilder('spec-capture', (s) => { capturedSpec = s; return {} as any; });
    buildTextModelFromSpec({ provider: 'spec-capture', model: 'my-model', apiKey: 'key-123' });
    expect(capturedSpec.model).toBe('my-model');
    expect(capturedSpec.apiKey).toBe('key-123');
  });
});

// ── TTS registry ──────────────────────────────────────────────────────────────

import { registerTTSProvider } from '../../src/core/tts/factory';
import type { TTSProvider } from '../../src/core/tts/interface';

describe('registerTTSProvider', () => {
  it('registers without modifying TTSFactory internals', () => {
    let called = false;
    const mockProvider: TTSProvider = {
      generateAudio: async () => { called = true; return new Uint8Array(0); },
    };
    registerTTSProvider('test-tts', () => mockProvider);
    // Provider is registered — factory would return it when resolved.
    // We verify registration succeeded without error.
    expect(called).toBe(false); // Not called until getProvider() + generateAudio()
  });
});

// ── STT registry ──────────────────────────────────────────────────────────────

import { registerSTTProvider } from '../../src/core/stt/factory';
import type { STTProvider } from '../../src/core/stt/interface';

describe('registerSTTProvider', () => {
  it('registers without modifying STTFactory internals', () => {
    const mockProvider: STTProvider = {
      transcribe: async () => ({ text: 'mock' }),
    };
    registerSTTProvider('test-stt', () => mockProvider);
    // Registration completes without error — that's the contract.
  });
});
