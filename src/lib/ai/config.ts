/**
 * Resolves provider + model for each feature according to the precedence:
 *
 *   1. <FEATURE>_PROVIDER / <FEATURE>_MODEL          (most specific)
 *   2. <CAPABILITY>_PROVIDER (capability-level default)
 *   3. GLOBAL_PROVIDER (user-friendly global default)
 *   4. FeatureSpec.defaultProvider / defaultModel    (baked-in)
 *
 * See docs/ai-provider-architecture.md §3.3.
 */

import {
  CAPABILITIES,
  FEATURES,
  InvalidProviderError,
  capabilityDefaultProviderEnv,
  capabilityDefaultModelEnv,
  type Capability,
  type FeatureKey,
  type FeatureSpec,
} from './capabilities';
import {
  getProvidersForCapability,
  getProviderDefault,
  getFeatureDefaults,
} from './dynamic-config';

export interface ResolvedFeature {
  feature: FeatureKey;
  capability: Capability;
  provider: string;
  /** Env-var prefix for this feature (e.g. "TRANSFORM"). */
  envPrefix: string;
  /** Provider-specific model identifier, or — for `cli/...` providers — the
   *  command path (e.g. `claude`, `/usr/local/bin/claude-canary`). */
  model: string;
  /** Optional base URL override. Used by the `openai` provider to point at
   *  any OpenAI-compatible local server (Kokoro / faster-whisper-server /
   *  LM Studio / vLLM / Ollama's /v1 endpoint, etc.). */
  baseUrl?: string;
  /** Optional API key override. Falls back to the provider's default env var
   *  (OPENAI_API_KEY etc.) when unset. Useful when a feature points at a
   *  local server that doesn't enforce auth — set any non-empty placeholder. */
  apiKey?: string;
}

export function resolveFeature(key: FeatureKey): ResolvedFeature {
  const spec = FEATURES[key];
  let provider = readProviderForFeature(spec);
  
  // Capability Validation Fallback:
  // If the resolved provider (e.g. from GLOBAL_PROVIDER) does not support
  // this capability, gracefully downgrade to 'none' instead of crashing.
  // This allows Global=Google + Feature=OpenAI mixing to work seamlessly.
  const validProviders = getProvidersForCapability(spec.capability);
  if (provider !== 'none' && !validProviders.includes(provider)) {
    console.warn(`[ai/config] Provider "${provider}" does not support capability "${spec.capability}" for feature "${key}". Falling back to "none".`);
    provider = 'none';
  }

  const model = readModelForFeature(spec, provider);
  const baseUrl = readBaseUrlForFeature(spec, provider);
  const apiKey = readApiKeyForFeature(spec, provider);
  
  // Final validation (should be 'none' if it fell through above)
  validateProvider(spec, provider);

  return {
    feature: key,
    capability: spec.capability,
    provider,
    model,
    baseUrl,
    apiKey,
    envPrefix: spec.envPrefix,
  };
}

function readProviderForFeature(spec: FeatureSpec): string {
  const featureProvider = process.env[`${spec.envPrefix}_PROVIDER`];
  if (featureProvider) return featureProvider.trim();

  const capProvider = process.env[capabilityDefaultProviderEnv(spec.capability)];
  if (capProvider) return capProvider.trim();

  const globalProvider = process.env.GLOBAL_PROVIDER;
  if (globalProvider) return globalProvider.trim();

  const defaultProvider = getFeatureDefaults(spec.key).defaultProvider;
  if (defaultProvider !== 'none') return defaultProvider;

  // Auto-detect from available API keys when no provider is explicitly set.
  // Checked in priority order: OpenAI → Google → Anthropic → Groq → DeepSeek → Qwen.
  const validProviders = getProvidersForCapability(spec.capability);
  const autoDetect: Array<[string, string | undefined]> = [
    ['openai',    process.env.OPENAI_API_KEY],
    ['google',    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY],
    ['anthropic', process.env.ANTHROPIC_API_KEY],
    ['groq',      process.env.GROQ_API_KEY],
    ['deepseek',  process.env.DEEPSEEK_API_KEY],
    ['qwen',      process.env.DASHSCOPE_API_KEY],
  ];
  for (const [provider, key] of autoDetect) {
    if (key && validProviders.includes(provider)) return provider;
  }

  return 'none';
}

function readModelForFeature(spec: FeatureSpec, provider: string): string {
  const featureModel = process.env[`${spec.envPrefix}_MODEL`];
  if (featureModel) return featureModel.trim();

  const capModel = process.env[capabilityDefaultModelEnv(spec.capability)];
  if (capModel) return capModel.trim();

  // Try provider-specific model (e.g. OLLAMA_MODEL, OPENAI_MODEL)
  const providerModelEnv = `${provider.replace(/\//g, '_').toUpperCase()}_MODEL`;
  const providerModel = process.env[providerModelEnv];
  if (providerModel) return providerModel.trim();

  // Try provider-specific default for this capability
  const providerDefault = getProviderDefault(provider, spec.capability);
  if (providerDefault) {
    return providerDefault;
  }

  // For cli/* providers, MODEL is a command-path override (e.g. `claude`,
  // `/usr/local/bin/claude-canary`). The SDK-flavor `spec.defaultModel`
  // (a model identifier like `gemini-3.1-pro-preview`) is meaningless as a
  // binary name. When the user hasn't set MODEL explicitly, fall back to the
  // CLI's own name so the adapter spawns it via PATH lookup.
  if (provider.startsWith('cli/')) {
    return provider.slice('cli/'.length);
  }

  return getFeatureDefaults(spec.key).defaultModel;
}

function readBaseUrlForFeature(spec: FeatureSpec, provider: string): string | undefined {
  const featureUrl = process.env[`${spec.envPrefix}_BASE_URL`];
  if (featureUrl) return featureUrl.trim();

  const capUrl = process.env[`${capabilityEnvPrefix(spec.capability)}_BASE_URL`];
  if (capUrl) {
    // If the capability-level provider doesn't match the current provider,
    // do NOT return the capability-level base URL. This prevents local
    // Ollama URLs from being used for cloud providers.
    const capProvider = process.env[capabilityDefaultProviderEnv(spec.capability)];
    const globalProvider = process.env.GLOBAL_PROVIDER;
    const resolvedCapProvider = (capProvider || globalProvider || getFeatureDefaults(spec.key).defaultProvider).trim();
    
    if (resolvedCapProvider === provider) {
        return capUrl.trim();
    }
  }

  return undefined;
}

function readApiKeyForFeature(spec: FeatureSpec, provider: string): string | undefined {
  const featureKey = process.env[`${spec.envPrefix}_API_KEY`];
  if (featureKey) return featureKey.trim();

  const capKey = process.env[`${capabilityEnvPrefix(spec.capability)}_API_KEY`];
  if (capKey) return capKey.trim();

  // Look up provider-specific API key (e.g. OPENAI_API_KEY)
  const providerKeyEnv = `${provider.toUpperCase()}_API_KEY`;
  const providerKey = process.env[providerKeyEnv];
  if (providerKey) return providerKey.trim();

  const globalKey = process.env.GLOBAL_API_KEY;
  if (globalKey) return globalKey.trim();

  return undefined;
}

function capabilityEnvPrefix(cap: Capability): string {
  return cap.replace(/-/g, '_').toUpperCase();
}

function validateProvider(spec: FeatureSpec, provider: string): void {
  const valid = getProvidersForCapability(spec.capability);
  if (!valid.includes(provider)) {
    throw new InvalidProviderError(provider, spec.capability, spec.key);
  }
}

export { CAPABILITIES, FEATURES };
