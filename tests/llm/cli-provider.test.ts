import { describe, it, expect, vi } from 'vitest';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import type { CliAdapter, AdapterResult } from '@/src/lib/ai/text/cli/adapter';
import { ClaudeAdapter } from '@/src/lib/ai/text/cli/adapters/claude';

// We exercise the CLI -> LanguageModelV3 wrapper end-to-end via the AI SDK's
// generateText/generateObject helpers, swapping the underlying CLIAdapter for
// a mock so no real subprocess is spawned.

function buildMockResult(content: string): AdapterResult {
  return {
    success: true,
    content,
    usage: { inputTokens: 10, outputTokens: 20, cachedTokens: 0 },
    errorMessage: null,
    errorCode: null,
    exitCode: 0,
    timedOut: false,
  };
}

function patchAdapter(content: string): { restore: () => void; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(async () => buildMockResult(content));
  const original = ClaudeAdapter.prototype.execute;
  ClaudeAdapter.prototype.execute = spy as typeof original;
  return {
    spy,
    restore: () => {
      ClaudeAdapter.prototype.execute = original;
    },
  };
}

describe('CLI text provider (claude)', () => {
  it('returns plain text via generateText', async () => {
    const { spy, restore } = patchAdapter('Hello from the mock CLI');
    try {
      const { cliTextModel } = await import('@/src/lib/ai/text/cli/provider');
      const model = cliTextModel('claude', 'claude');

      const result = await generateText({
        model,
        prompt: 'Say hello',
      });

      expect(result.text).toBe('Hello from the mock CLI');
      expect(spy).toHaveBeenCalledOnce();
      const call = spy.mock.calls[0][0];
      expect(call.prompt).toContain('Say hello');
    } finally {
      restore();
    }
  });

  it('parses JSON output via generateObject', async () => {
    // Emulate what the schema injection encourages the CLI to return.
    const json = JSON.stringify({ ok: true, message: 'roundtrip' });
    const { spy, restore } = patchAdapter(json);
    try {
      const { cliTextModel } = await import('@/src/lib/ai/text/cli/provider');
      const model = cliTextModel('claude', 'claude');

      const schema = z.object({ ok: z.boolean(), message: z.string() });
      const { object } = await generateObject({
        model,
        schema,
        prompt: 'Return a JSON object with ok=true and message="roundtrip".',
      });

      expect(object).toEqual({ ok: true, message: 'roundtrip' });
      const call = spy.mock.calls[0][0];
      expect(call.prompt).toMatch(/JSON Schema/i);
    } finally {
      restore();
    }
  });

  it('strips surrounding code fences and prose before parsing JSON', async () => {
    const wrapped = '```json\n{"ok":true,"message":"yes"}\n```';
    const { restore } = patchAdapter(wrapped);
    try {
      const { cliTextModel } = await import('@/src/lib/ai/text/cli/provider');
      const model = cliTextModel('claude', 'claude');

      const schema = z.object({ ok: z.boolean(), message: z.string() });
      const { object } = await generateObject({ model, schema, prompt: 'irrelevant' });

      expect(object).toEqual({ ok: true, message: 'yes' });
    } finally {
      restore();
    }
  });

  it('maps auth_required adapter errors to a non-retryable APICallError', async () => {
    const fail: AdapterResult = {
      success: false,
      content: '',
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      errorMessage: 'not logged in',
      errorCode: 'auth_required',
      exitCode: 1,
      timedOut: false,
    };
    const original = ClaudeAdapter.prototype.execute;
    ClaudeAdapter.prototype.execute = vi.fn(async () => fail) as typeof original;
    try {
      const { cliTextModel } = await import('@/src/lib/ai/text/cli/provider');
      const model = cliTextModel('claude', 'claude');

      await expect(
        generateText({ model, prompt: 'irrelevant', maxRetries: 0 }),
      ).rejects.toThrow(/not authenticated/);
    } finally {
      ClaudeAdapter.prototype.execute = original;
    }
  });
});

describe('CLI text provider (capability matrix)', () => {
  it('rejects cli/claude when configured for a non-text feature', async () => {
    const previous = process.env.IMAGE_GEN_PROVIDER;
    process.env.IMAGE_GEN_PROVIDER = 'cli/claude';
    try {
      vi.resetModules();
      // Sub-path imports avoid the top-level eager model construction.
      const { resolveFeature } = await import('@/src/lib/ai/config');
      const { InvalidProviderError } = await import('@/src/lib/ai/capabilities');
      expect(() => resolveFeature('imageGen')).toThrow(InvalidProviderError);
    } finally {
      if (previous === undefined) delete process.env.IMAGE_GEN_PROVIDER;
      else process.env.IMAGE_GEN_PROVIDER = previous;
      vi.resetModules();
    }
  });
});
