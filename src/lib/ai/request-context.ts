/**
 * Shared request-context helpers for API route handlers.
 *
 * Each helper collapses the repeated boilerplate in LLM routes:
 *   extractSettings → resolveFeature/override → getUserId
 *
 * Use these for routes where the pattern is clean (transform, roleplay).
 * Routes with mixed concerns (speech-eval uses both STT + text model) or
 * special structures (SSE streaming in generate-course) may call the
 * individual functions directly for clarity.
 */
import type { LanguageModel } from 'ai';
import { getUserId } from '@/src/lib/auth/user';
import {
  extractSettings,
  resolveFeatureFromSettings,
  resolveTTSOverride,
  resolveSTTOverride,
  type TTSOverride,
  type STTOverride,
  type RequestSettings,
} from './settings-config';
import type { FeatureKey } from './capabilities';

// ── Text feature context ──────────────────────────────────────────────────────

export interface TextRequestContext {
  /** Client-supplied model override, or undefined (fall back to env-var config). */
  model: LanguageModel | undefined;
  userId: string;
  /** Full settings for routes that need additional fields (e.g. STT override). */
  settings: RequestSettings;
}

/** Resolve model + userId for a text-generation feature. */
export async function resolveTextContext(
  feature: FeatureKey,
  request: Request,
): Promise<TextRequestContext> {
  const settings = extractSettings(request);
  const model = resolveFeatureFromSettings(feature, settings);
  const userId = await getUserId(request);
  return { model, userId, settings };
}

// ── TTS context ───────────────────────────────────────────────────────────────

export interface TTSRequestContext {
  ttsOverride: TTSOverride | undefined;
}

export async function resolveTTSContext(request: Request): Promise<TTSRequestContext> {
  return { ttsOverride: resolveTTSOverride(extractSettings(request)) };
}

// ── STT context ───────────────────────────────────────────────────────────────

export interface STTRequestContext {
  sttOverride: STTOverride | undefined;
}

export async function resolveSTTContext(request: Request): Promise<STTRequestContext> {
  return { sttOverride: resolveSTTOverride(extractSettings(request)) };
}
