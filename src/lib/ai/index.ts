/**
 * AI provider layer — feature-based exports.
 *
 * Each feature (transform / courseGen / roleplay / speechEval / imageGen / tts /
 * stt) has its own pre-built model resolved from env vars at module load.
 * Configuration precedence:
 *   <FEATURE>_PROVIDER  >  <CAPABILITY>_PROVIDER  >  baked-in default
 *   <FEATURE>_MODEL     >                            baked-in default
 *
 * Capability-level provider env vars: TEXT_PROVIDER, TEXT_TO_IMAGE_PROVIDER,
 * TEXT_TO_SPEECH_PROVIDER, SPEECH_TO_TEXT_PROVIDER.
 *
 * Subscription CLIs are addressed as `cli/claude` and `cli/gemini`. They are
 * text-only — selecting a CLI for any non-text feature throws at module load.
 *
 * Stub capabilities (text-to-video, image-to-video, multimodal-to-video) are
 * declared but throw NotImplementedError when called.
 *
 * Usage:
 *   import { transformModel, courseGenModel, roleplayModel,
 *            speechEvalModel, imageGenModel, ttsModel, sttModel
 *          } from '@/src/lib/ai';
 *
 *   const { object } = await generateObject({ model: transformModel, schema, prompt });
 *
 * See docs/ai-provider-architecture.md §3.
 */

import { buildTextModelFor } from './text/factory';
import { buildImageModel } from './text-to-image/factory';
import { buildSpeechModel } from './text-to-speech/factory';
import { buildTranscriptionModel } from './speech-to-text/factory';
import type { LanguageModel } from 'ai';

function createModelProxy<T extends object>(builder: () => T): T {
  return new Proxy({} as T, {
    get(_, prop) {
      const model = builder();
      const val = (model as any)[prop];
      if (typeof val === 'function') {
        return val.bind(model);
      }
      return val;
    },
  });
}

// --- Text features (capability: text) ---
export const transformModel = createModelProxy(() => buildTextModelFor('transform'));
export const courseGenModel = createModelProxy(() => buildTextModelFor('courseGen'));
export const roleplayModel = createModelProxy(() => buildTextModelFor('roleplay'));

/**
 * LLM "Speech Assessor" model. Used in /api/speech-eval to evaluate
 * transcribed user speech against target text, providing scores for
 * pronunciation and logic stress.
 */
export const speechEvalModel = createModelProxy(() => buildTextModelFor('speechEval'));

// --- text-to-image / text-to-speech / speech-to-text ---
export const imageGenModel = createModelProxy(() => buildImageModel());
export const ttsModel      = createModelProxy(() => buildSpeechModel());
export const sttModel      = createModelProxy(() => buildTranscriptionModel());

// --- Stub capabilities (throw on first use) ---
export { buildTextToVideoModel } from './text-to-video/factory';
export { buildImageToVideoModel } from './image-to-video/factory';
export { buildMultimodalToVideoModel } from './multimodal-to-video/factory';

// --- Capability + feature metadata for tooling and tests ---
export {
  CAPABILITIES,
  FEATURES,
  PROVIDERS_BY_CAPABILITY,
  PROVIDER_DEFAULTS,
  STANDARD_MODE_CAPABILITIES,
  isFullStackProvider,
  InvalidProviderError,
  NotImplementedError,
  type Capability,
  type FeatureKey,
  type FeatureSpec,
} from './capabilities';

export { resolveFeature, type ResolvedFeature } from './config';
