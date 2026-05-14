import {
  type Capability,
  type FeatureKey,
} from './capabilities';
import {
  PROVIDERS_BY_CAPABILITY as STATIC_PROVIDERS_BY_CAPABILITY,
  PROVIDER_DEFAULTS as STATIC_PROVIDER_DEFAULTS,
  FEATURES as STATIC_FEATURES,
} from './static-defaults';
import { PROVIDER_BASE_URLS as STATIC_PROVIDER_BASE_URLS } from './provider-urls';

/**
 * Global application configuration.
 * This structure is designed to be extensible as the application evolves.
 */
export interface AppConfig {
  ai: {
    providersByCapability: Record<Capability, string[]>;
    providerDefaults: Record<string, Partial<Record<Capability, string>>>;
    featureDefaults: Record<FeatureKey, { defaultProvider: string; defaultModel: string }>;
    providerBaseUrls: Record<string, string>;
    providerTTSVoices: Record<string, string>;
  };
  // Add other feature-affecting defaults here as needed
  // UI settings, feature flags, etc.
}

// Initial state from hardcoded constants
const initialState: AppConfig = {
  ai: {
    providersByCapability: Object.entries(STATIC_PROVIDERS_BY_CAPABILITY).reduce(
      (acc, [cap, providers]) => ({ ...acc, [cap]: [...providers] }),
      {} as Record<Capability, string[]>
    ),
    providerDefaults: JSON.parse(JSON.stringify(STATIC_PROVIDER_DEFAULTS)),
    featureDefaults: Object.entries(STATIC_FEATURES).reduce(
      (acc, [key, spec]) => ({
        ...acc,
        [key]: { defaultProvider: spec.defaultProvider, defaultModel: spec.defaultModel },
      }),
      {} as Record<FeatureKey, { defaultProvider: string; defaultModel: string }>
    ),
    providerBaseUrls: { ...STATIC_PROVIDER_BASE_URLS },
    providerTTSVoices: {
      qwen: 'longxiaochun',
      openrouter: 'alloy',
      openai: 'alloy',
    },
  },
};

let currentConfig: AppConfig = initialState;

/** Get the current application configuration. */
export function getAppConfig(): AppConfig {
  return currentConfig;
}

/** Update the application configuration. */
export function updateAppConfig(patch: Partial<AppConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...patch,
  };
}

/** 
 * Refresh the configuration from the CoreFirst SaaS server. 
 */
export async function refreshAppConfig(): Promise<void> {
  const serverUrl = process.env.COREFIRST_SERVER_URL;
  if (!serverUrl) {
    console.warn('[config] COREFIRST_SERVER_URL not set. Skipping hot update.');
    return;
  }

  // Ensure we are calling the config endpoint
  const configEndpoint = serverUrl.endsWith('/config') ? serverUrl : `${serverUrl.replace(/\/$/, '')}/api/v1/config`;

  try {
    const response = await fetch(configEndpoint, { 
      headers: { 'Cache-Control': 'no-cache' },
      next: { revalidate: 0 } // For Next.js fetch caching
    });
    if (!response.ok) throw new Error(`Failed to fetch config: ${response.statusText}`);
    const data = await response.json();
    updateAppConfig(data);
    console.log('[config] Application configuration updated from CoreFirst server.');
  } catch (error) {
    console.error('[config] Failed to refresh app config:', error);
  }
}

// AI-specific helper functions for resolution logic

export function getProvidersForCapability(cap: Capability): string[] {
  return currentConfig.ai.providersByCapability[cap] || [];
}

export function getProviderDefault(provider: string, cap: Capability): string | undefined {
  return currentConfig.ai.providerDefaults[provider]?.[cap];
}

export function getFeatureDefaults(key: FeatureKey) {
  return currentConfig.ai.featureDefaults[key];
}

export function getProviderBaseUrl(provider: string): string | undefined {
  return currentConfig.ai.providerBaseUrls[provider];
}

export function getProviderTTSVoice(provider: string): string {
  return currentConfig.ai.providerTTSVoices[provider] || 'alloy';
}

/**
 * Return the default text model for a provider.
 */
export function getDefaultTextModel(provider: string): string {
  return getProviderDefault(provider, 'text') ?? '';
}

export const STANDARD_MODE_CAPABILITIES: readonly Capability[] = [
  'text',
  'text-to-image',
  'text-to-speech',
  'speech-to-text',
];

export function isFullStackProvider(provider: string): boolean {
  const defaults = currentConfig.ai.providerDefaults[provider];
  if (!defaults) return false;
  return STANDARD_MODE_CAPABILITIES.every((cap) => Boolean(defaults[cap]));
}

// Trigger initial refresh on server startup
if (typeof window === 'undefined') {
  refreshAppConfig();
}
