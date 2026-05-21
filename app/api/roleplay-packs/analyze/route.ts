import { NextResponse } from 'next/server';
import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';
import { roleplayModel } from '@/src/lib/ai';
import { getUserId } from '@/src/lib/auth/user';
import { resolveTextContext } from '@/src/lib/ai/request-context';
import { buildAIErrorResponse } from '@/src/lib/ai/errors';

const ResultSchema = z.object({
  name: z.string(),
  category: z.string(),
});

export async function POST(request: Request) {
  await getUserId(request);
  let body: { prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const prompt = (body.prompt ?? '').trim();
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  try {
    const { model } = await resolveTextContext('roleplay', request);
    const activeModel = (model ?? roleplayModel) as LanguageModel;
    const { object } = await generateObject({
      model: activeModel,
      schema: ResultSchema,
      prompt: `Given this roleplay coach instruction prompt, suggest a concise pack name (3–5 words, title case) and a category category (e.g. "IT / Software Engineering", "Business / Finance", "General / Life", "Medical / Healthcare", "Legal / Law").\n\nPrompt:\n${prompt}`,
    });
    return NextResponse.json(object);
  } catch (err) {
    return buildAIErrorResponse(err);
  }
}
