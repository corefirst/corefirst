import { NextResponse } from 'next/server';
import { refreshAppConfig, getAppConfig } from '@/src/lib/ai/dynamic-config';

export async function POST(request: Request) {
  // Removed admin check - anyone can trigger a refresh of the global defaults
  await refreshAppConfig();
  const config = getAppConfig();

  return NextResponse.json({
    message: 'Application configuration refreshed successfully.',
    config,
  });
}

export async function GET() {
  return NextResponse.json(getAppConfig());
}
