/**
 * Capability and feature taxonomy for the AI provider layer.
 *
 *  - A *capability* is a kind of model interface (e.g. text generation,
 *    text-to-image, text-to-speech). Each capability has its own set of
 *    supported providers.
 *  - A *feature* is a use site inside CoreFirst that needs a specific
 *    capability. Each feature gets its own configuration knob so different
 *    parts of the app can use different models without touching code.
 *
 * See docs/ai-provider-architecture.md §3.
 */

export const CAPABILITIES = [
  'text',
  'text-to-image',
  'text-to-speech',
  'speech-to-text',
  'text-to-video', // stub — not implemented in v1
  'image-to-video', // stub
  'multimodal-to-video', // stub
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Providers per capability. Subscription CLIs (`cli/claude`, `cli/gemini`)
 * are text-only by design — see docs/ai-provider-architecture.md §3.3.6.
 */
export const PROVIDERS_BY_CAPABILITY: Record<Capability, readonly string[]> = {
  text: [
    'google',
    'openai',
    'anthropic',
    'ollama',
    'groq',
    'openrouter',
    'qwen',
    'deepseek',
    'cli/claude',
    'cli/gemini',
    'none',
  ],
  'text-to-image': ['google', 'openai', 'qwen', 'openrouter', 'none'],
  'text-to-speech': ['openai', 'google', 'qwen', 'openrouter', 'none'],
  'speech-to-text': ['openai', 'google', 'qwen', 'openrouter', 'none'],
  'text-to-video': [],
  'image-to-video': [],
  'multimodal-to-video': [],
};

/**
 * Default models for each provider and capability. Used when a user selects
 * a GLOBAL_PROVIDER without specifying models for each feature.
 */
export const PROVIDER_DEFAULTS: Record<string, Partial<Record<Capability, string>>> = {
  google: {
    text: 'gemini-2.5-pro-preview',
    'text-to-image': 'imagen-3.0-generate-001',
    'text-to-speech': 'gemini-2.5-flash-preview-tts',
    'speech-to-text': 'gemini-2.5-flash',
  },
  openai: {
    text: 'gpt-4o',
    'text-to-image': 'dall-e-3',
    'text-to-speech': 'tts-1',
    'speech-to-text': 'whisper-1',
  },
  anthropic: { text: 'claude-sonnet-4-6' },
  ollama: { text: 'llama3.2' },
  groq: { text: 'llama-3.3-70b-versatile' },
  deepseek: { text: 'deepseek-chat' },
  qwen: {
    text: 'qwen3.5-plus',
    'text-to-image': 'wanx2.7-image',
    'text-to-speech': 'cosyvoice-v3.5-flash',
    'speech-to-text': 'sensevoice-v1',
  },
  openrouter: {
    text: 'google/gemini-flash-1.5',
    'text-to-image': 'black-forest-labs/flux-schnell',
    'text-to-speech': 'openai/tts-1',
    'speech-to-text': 'openai/whisper-1',
  },
  // CLI providers — model is a command name / path, not a model identifier.
  'cli/claude': { text: 'claude' },
  'cli/gemini': { text: 'gemini' },
};

/**
 * Capabilities required for a provider to qualify for "Standard mode" — i.e.
 * the user can paste a single key and get text, image, TTS, and STT working.
 * If a provider has a default model registered in PROVIDER_DEFAULTS for every
 * capability in this list, it shows up in the Standard provider picker.
 */
export const STANDARD_MODE_CAPABILITIES: readonly Capability[] = [
  'text',
  'text-to-image',
  'text-to-speech',
  'speech-to-text',
];

export function isFullStackProvider(provider: string): boolean {
  const defaults = PROVIDER_DEFAULTS[provider];
  if (!defaults) return false;
  return STANDARD_MODE_CAPABILITIES.every((cap) => Boolean(defaults[cap]));
}

/**
 * Features that consume an AI capability. Each is a separate use site whose
 * model and provider can be overridden independently via env vars:
 *   <FEATURE>_PROVIDER  e.g. TRANSFORM_PROVIDER=cli/claude
 *   <FEATURE>_MODEL     e.g. TRANSFORM_MODEL=gemini-3.1-pro-preview
 *
 * If a feature env var is unset, the capability-level default is used
 * (TEXT_PROVIDER, TEXT_TO_IMAGE_PROVIDER, etc.).
 */
export interface FeatureSpec {
  key: FeatureKey;
  capability: Capability;
  /** Env-var prefix. The provider override is `<PREFIX>_PROVIDER`,
   *  the model override is `<PREFIX>_MODEL`. */
  envPrefix: string;
  /** Sane defaults — used when neither feature nor capability env is set. */
  defaultProvider: string;
  defaultModel: string;
  /** Short rationale shown in errors / logs. */
  rationale: string;
}

export type FeatureKey =
  | 'transform'
  | 'courseGen'
  | 'roleplay'
  | 'speechEval'
  | 'imageGen'
  | 'tts'
  | 'stt';

export const FEATURES: Record<FeatureKey, FeatureSpec> = {
  transform: {
    key: 'transform',
    capability: 'text',
    envPrefix: 'TRANSFORM',
    defaultProvider: 'none',
    defaultModel: 'gemini-2.5-pro-preview',
    rationale: 'CFLT Logic Transformer — quality-critical: structured output must be exact.',
  },
  courseGen: {
    key: 'courseGen',
    capability: 'text',
    envPrefix: 'COURSE_GEN',
    defaultProvider: 'none',
    defaultModel: 'gemini-2.5-pro-preview',
    rationale: 'Courseware orchestrator — full lesson manifest, multi-script audit.',
  },
  roleplay: {
    key: 'roleplay',
    capability: 'text',
    envPrefix: 'ROLEPLAY',
    defaultProvider: 'none',
    defaultModel: 'gemini-2.0-flash',
    rationale: 'Multi-turn dialogue — cost-optimized, latency-sensitive.',
  },
  speechEval: {
    key: 'speechEval',
    capability: 'text',
    envPrefix: 'SPEECH_EVAL',
    defaultProvider: 'none',
    defaultModel: 'gemini-2.0-flash',
    rationale: 'LLM "Speech Assessor" — compares user transcription vs target text to provide scores and corrective feedback (the "Teacher" logic).',
  },
  imageGen: {
    key: 'imageGen',
    capability: 'text-to-image',
    envPrefix: 'IMAGE_GEN',
    defaultProvider: 'none',
    defaultModel: 'imagen-4.0-generate-001',
    rationale: 'Lesson scene image generation.',
  },
  tts: {
    key: 'tts',
    capability: 'text-to-speech',
    envPrefix: 'TTS',
    defaultProvider: 'none',
    defaultModel: 'gpt-4o-mini-tts',
    rationale: 'Text-to-speech for lesson audio + Transform/Roleplay playback.',
  },
  stt: {
    key: 'stt',
    capability: 'speech-to-text',
    envPrefix: 'STT',
    defaultProvider: 'none',
    defaultModel: 'gpt-4o-mini-transcribe',
    rationale: 'Speech transcription for voice challenges + roleplay voice input.',
  },
};

/** Capability-level default env var names (e.g. "TEXT_PROVIDER", "TEXT_MODEL"). */
export function capabilityDefaultProviderEnv(cap: Capability): string {
  return `${capabilityEnvPrefix(cap)}_PROVIDER`;
}

export function capabilityDefaultModelEnv(cap: Capability): string {
  return `${capabilityEnvPrefix(cap)}_MODEL`;
}

function capabilityEnvPrefix(cap: Capability): string {
  return cap.replace(/-/g, '_').toUpperCase();
}

/**
 * Return the default text model for a provider.
 * Single source of truth — replaces the deprecated PROVIDER_DEFAULT_MODELS
 * constant that previously lived in src/lib/constants.ts.
 */
export function getDefaultTextModel(provider: string): string {
  return PROVIDER_DEFAULTS[provider]?.text ?? '';
}

export class InvalidProviderError extends Error {
  constructor(provider: string, capability: Capability, feature?: FeatureKey) {
    const where = feature ? `feature "${feature}" (capability ${capability})` : `capability ${capability}`;
    super(
      `Provider "${provider}" is not supported for ${where}. ` +
      `Valid: ${(PROVIDERS_BY_CAPABILITY[capability] ?? []).join(', ') || '(none — capability not implemented)'}.`,
    );
    this.name = 'InvalidProviderError';
  }
}

export class NotImplementedError extends Error {
  constructor(capability: Capability) {
    super(
      `Capability "${capability}" is declared but not implemented in this release. ` +
      `See docs/ai-provider-architecture.md §3.6.`,
    );
    this.name = 'NotImplementedError';
  }
}
