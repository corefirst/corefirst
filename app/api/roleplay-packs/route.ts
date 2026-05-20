import { NextResponse } from 'next/server';
import { getUserId } from '@/src/lib/auth/user';
import { listPacks, writePack, validatePackJSON } from '@/src/lib/roleplay-pack/loader';

export async function GET(request: Request) {
  const userId = await getUserId(request);
  const entries = await listPacks(userId);
  const list = entries.map(({ pack, source }) => ({
    id: pack.id,
    name: pack.name,
    description: pack.description,
    version: pack.version,
    domain: pack.domain,
    targetLang: pack.targetLang,
    authorLang: pack.authorLang,
    source,
    scenarios: pack.scenarios.map((s) => ({ id: s.id, title: s.title, description: s.description })),
    personas: pack.personas.map((p) => ({ id: p.id, role: p.role, formality: p.formality })),
  }));
  return NextResponse.json({ packs: list });
}

export async function POST(request: Request) {
  const userId = await getUserId(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const validated = validatePackJSON(body);
  if (!validated.ok) {
    return NextResponse.json({ error: 'Validation failed', issues: validated.issues }, { status: 400 });
  }
  try {
    await writePack(userId, validated.pack);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: validated.pack.id });
}
