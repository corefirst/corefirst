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
 */
export interface AppConfig {
  ai: {
    providersByCapability: Record<Capability, string[]>;
    providerDefaults: Record<string, Partial<Record<Capability, string>>>;
    featureDefaults: Record<FeatureKey, { defaultProvider: string; defaultModel: string }>;
    providerBaseUrls: Record<string, string>;
    providerTTSVoices: Record<string, string>;
  };
}

// L1: Initial state from hardcoded constants
const staticDefaults: AppConfig = {
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
      qwen: 'Cherry',
      openrouter: 'alloy',
      openai: 'alloy',
    },
  },
};

let currentConfig: AppConfig = staticDefaults;

/** 
 * L2: Load last known good config from local disk.
 */
async function loadPersistedConfig() {
  if (typeof window !== 'undefined') return;
  
  try {
    // Dynamic import to avoid client-side build errors
    const fs = await import('fs');
    const path = await import('path');
    const cacheFile = path.join(process.cwd(), 'data/app-config-cache.json');

    if (fs.existsSync(cacheFile)) {
      const data = fs.readFileSync(cacheFile, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed?.ai?.providerDefaults) {
        currentConfig = parsed;
        console.log('[config] Loaded last known good config from disk.');
      }
    }
  } catch (e) {
    console.warn('[config] Failed to load persisted config:', e);
  }
}

/** Update the application configuration and persist it. */
export async function updateAppConfig(patch: Partial<AppConfig>): Promise<void> {
  const nextConfig = {
    ...currentConfig,
    ...patch,
    ai: {
      ...currentConfig.ai,
      ...(patch.ai || {}),
    }
  };
  
  currentConfig = nextConfig;

  // Persist to disk for next boot (L2)
  if (typeof window === 'undefined') {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const cacheFile = path.join(process.cwd(), 'data/app-config-cache.json');
      const dir = path.dirname(cacheFile);
      
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(currentConfig, null, 2));
    } catch (e) {
      console.error('[config] Failed to persist config update:', e);
    }
  }
}

/** 
 * L3: Refresh from cloud server.
 */
export async function refreshAppConfig(): Promise<void> {
  const serverUrl = process.env.COREFIRST_SERVER_URL;
  if (!serverUrl) return;

  const configEndpoint = serverUrl.endsWith('/config') ? serverUrl : `${serverUrl.replace(/\/$/, '')}/api/v1/config`;

  try {
    const response = await fetch(configEndpoint, { 
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) return;
    const data = await response.json();
    
    if (!data || typeof data !== 'object' || !data.ai) return;

    await updateAppConfig(data);
    console.log('[config] Hot update successful: Config synced with CoreFirst server.');
  } catch (error) {
    console.warn('[config] Could not sync with cloud server (offline or timeout).');
  }
}

// Initial initialization (Server-side only)
if (typeof window === 'undefined') {
  loadPersistedConfig().then(() => {
    refreshAppConfig();
  });
}

/** Get the current application configuration. */
export function getAppConfig(): AppConfig {
  return currentConfig;
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
