/**
 * Capability and feature taxonomy for the AI provider layer.
 */

import {
  PROVIDERS_BY_CAPABILITY,
  PROVIDER_DEFAULTS,
  FEATURES,
} from './static-defaults';

import {
  getDefaultTextModel as getDynamicDefaultTextModel,
  isFullStackProvider as isDynamicFullStackProvider,
  STANDARD_MODE_CAPABILITIES as DYNAMIC_STANDARD_MODE_CAPABILITIES,
} from './dynamic-config';

export {
  PROVIDERS_BY_CAPABILITY,
  PROVIDER_DEFAULTS,
  FEATURES,
};

export const CAPABILITIES = [
  'text',
  'text-to-image',
  'text-to-speech',
  'speech-to-text',
  'text-to-video',
  'image-to-video',
  'multimodal-to-video',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const STANDARD_MODE_CAPABILITIES = DYNAMIC_STANDARD_MODE_CAPABILITIES;

export function isFullStackProvider(provider: string): boolean {
  return isDynamicFullStackProvider(provider);
}

export interface FeatureSpec {
  key: FeatureKey;
  capability: Capability;
  envPrefix: string;
  defaultProvider: string;
  defaultModel: string;
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

export function capabilityDefaultProviderEnv(cap: Capability): string {
  return `${capabilityEnvPrefix(cap)}_PROVIDER`;
}

export function capabilityDefaultModelEnv(cap: Capability): string {
  return `${capabilityEnvPrefix(cap)}_MODEL`;
}

function capabilityEnvPrefix(cap: Capability): string {
  return cap.replace(/-/g, '_').toUpperCase();
}

export function getDefaultTextModel(provider: string): string {
  return getDynamicDefaultTextModel(provider);
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
      `Capability "${capability}" is declared but not implemented in this release.`,
    );
    this.name = 'NotImplementedError';
  }
}
