import { NextResponse } from 'next/server';
import { resolveFeature } from '@/src/lib/ai/config';
import { FEATURES } from '@/src/lib/ai/static-defaults';
import type { FeatureKey } from '@/src/lib/ai/capabilities';

export type CapabilitiesResponse = Record<string, string>;

export async function GET() {
  const providers: CapabilitiesResponse = {};
  for (const key of Object.keys(FEATURES) as FeatureKey[]) {
    try {
      providers[key] = resolveFeature(key).provider;
    } catch {
      providers[key] = 'none';
    }
  }
  return NextResponse.json(providers);
}
