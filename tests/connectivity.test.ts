/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { CFLTTransformer } from '@/src/core/transformer';
import { TTSFactory } from '@/src/core/tts/factory';
import { STTFactory } from '@/src/core/stt/factory';

// This suite performs REAL network calls to verify provider connectivity.
// It skips automatically if the required API keys are not present in the environment.

const hasKey = (key: string) => !!process.env[key];

describe('AI Provider Connectivity Smoke Tests', () => {
  
  // ── OpenAI ─────────────────────────────────────────────────────────────────
  describe('OpenAI', () => {
    const skip = !hasKey('OPENAI_API_KEY');

    it.skipIf(skip)('can perform a minimal transformation', async () => {
      process.env.TRANSFORM_PROVIDER = 'openai';
      process.env.TRANSFORM_MODEL = 'gpt-4o-mini'; // Use a standard model
      const transformer = new CFLTTransformer();
      const result = await transformer.transform('Hello', 'English', 'Chinese');
      expect(result).not.toHaveProperty('error');
    });

    it.skipIf(skip)('can generate a short audio clip', async () => {
      const provider = TTSFactory.getProvider({ provider: 'openai', model: 'tts-1' });
      const audio = await provider.generateAudio('Hello');
      expect(audio.byteLength).toBeGreaterThan(0);
    });
  });

  // ── Google Gemini ──────────────────────────────────────────────────────────
  describe('Google Gemini', () => {
    const skip = !(hasKey('GOOGLE_GENERATIVE_AI_API_KEY') || hasKey('GOOGLE_API_KEY'));

    it.skipIf(skip)('can perform a minimal transformation', async () => {
      process.env.TRANSFORM_PROVIDER = 'google';
      process.env.TRANSFORM_MODEL = 'gemini-1.5-flash';
      const transformer = new CFLTTransformer();
      const result = await transformer.transform('Hello', 'English', 'Chinese');
      expect(result).not.toHaveProperty('error');
    });

    it.skipIf(skip)('can generate a short audio clip', async () => {
      const provider = TTSFactory.getProvider({ provider: 'google', model: 'gemini-2.0-flash-exp' });
      const audio = await provider.generateAudio('Hello');
      expect(audio.byteLength).toBeGreaterThan(0);
    });
  });

  // ── Anthropic ──────────────────────────────────────────────────────────────
  describe('Anthropic', () => {
    const skip = !hasKey('ANTHROPIC_API_KEY');

    it.skipIf(skip)('can perform a minimal transformation', async () => {
      process.env.TRANSFORM_PROVIDER = 'anthropic';
      const transformer = new CFLTTransformer();
      const result = await transformer.transform('Hello', 'English', 'Chinese');
      expect(result).not.toHaveProperty('error');
    });
  });

  // ── Groq ───────────────────────────────────────────────────────────────────
  describe('Groq', () => {
    const skip = !hasKey('GROQ_API_KEY');

    it.skipIf(skip)('can perform a minimal transformation', async () => {
      process.env.TRANSFORM_PROVIDER = 'groq';
      const transformer = new CFLTTransformer();
      const result = await transformer.transform('Hello', 'English', 'Chinese');
      expect(result).not.toHaveProperty('error');
    });
  });

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  describe('DeepSeek', () => {
    const skip = !hasKey('DEEPSEEK_API_KEY');

    it.skipIf(skip)('can perform a minimal transformation', async () => {
      process.env.TRANSFORM_PROVIDER = 'deepseek';
      const transformer = new CFLTTransformer();
      const result = await transformer.transform('Hello', 'English', 'Chinese');
      expect(result).not.toHaveProperty('error');
    });
  });

  // ── Qwen (DashScope) ───────────────────────────────────────────────────────
  describe('Qwen / DashScope', () => {
    const skip = !hasKey('DASHSCOPE_API_KEY');

    it.skipIf(skip)('can perform a minimal transformation', async () => {
      process.env.TRANSFORM_PROVIDER = 'qwen';
      const transformer = new CFLTTransformer();
      const result = await transformer.transform('Hello', 'English', 'Chinese');
      expect(result).not.toHaveProperty('error');
    });

    it.skipIf(skip)('can generate a short audio clip', async () => {
      const provider = TTSFactory.getProvider({ provider: 'qwen' });
      const audio = await provider.generateAudio('Hello');
      expect(audio.byteLength).toBeGreaterThan(0);
    });
  });

  // ── OpenRouter ─────────────────────────────────────────────────────────────
  describe('OpenRouter', () => {
    const skip = !hasKey('OPENROUTER_API_KEY');

    it.skipIf(skip)('can perform a minimal transformation', async () => {
      process.env.TRANSFORM_PROVIDER = 'openrouter';
      process.env.TRANSFORM_MODEL = 'openai/gpt-4o-mini';
      const transformer = new CFLTTransformer();
      const result = await transformer.transform('Hello', 'English', 'Chinese');
      expect(result).not.toHaveProperty('error');
    });

    it.skipIf(skip)('can generate a short audio clip', async () => {
      const provider = TTSFactory.getProvider({ 
        provider: 'openrouter', 
        model: 'openai/gpt-4o-mini-tts-2025-12-15' 
      });
      const audio = await provider.generateAudio('Hello');
      expect(audio.byteLength).toBeGreaterThan(0);
    });
  });

});
