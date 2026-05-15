import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateText } from 'ai';
import { buildBYOKModel } from '@/src/lib/ai/request-config';

const Schema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().optional().default(''),
  baseUrl: z.string().optional().default(''),
  model: z.string().optional().default(''),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'provider and apiKey are required' }, { status: 400 });
  }

  const { provider, apiKey, baseUrl, model: modelOverride } = parsed.data;

  try {
    const model = buildBYOKModel({ provider, apiKey, baseUrl, model: modelOverride });
    await generateText({ model, prompt: 'Say OK', maxOutputTokens: 16 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[verify-key] Verification failed:', msg);

    let userMessage = "We couldn't connect. Please check your network or ensure your account has sufficient balance/credits.";
    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key')) {
      userMessage = 'Invalid API key. Please double-check you copied it correctly.';
    } else if (msg.includes('403') || msg.includes('Forbidden')) {
      userMessage = 'Access denied. Your key may not have permission for this model or region.';
    } else if (msg.includes('429') || msg.includes('rate')) {
      userMessage = 'Rate limit hit. Your key is valid but usage limit reached. Try again shortly.';
    } else if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('credit')) {
      userMessage = 'Your account appears to have insufficient credits. Please top up and try again.';
    }

    return NextResponse.json({ ok: false, error: userMessage });
  }
}
