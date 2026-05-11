import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { generateObject } from 'ai';
import { transformModel } from '@/src/lib/ai';
import { CFLTResponseSchema } from '@/src/types/cflt';
import { providerFor } from '@/src/lib/storage/pouch-provider';
import { listTransformEvents, listRoleplaySessions } from '@/src/lib/storage/record';
import { listPackages } from '@/src/lib/storage/package';
import { manifestPath } from '@/src/lib/storage/paths';
import { getUserId } from '@/src/lib/auth/user';

// Read system_prompt.md fresh so this repair route always uses the latest
// version (the module-level cache in transformer.ts may hold the old prompt).
function buildSystemPrompt(sourceLang: string, targetLang: string): string {
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'src/core/system_prompt.md'),
    'utf-8',
  );
  return raw
    .replace(/{{SOURCE_LANG}}/g, sourceLang)
    .replace(/{{TARGET_LANG}}/g, targetLang)
    .replace(/{{UI_LANG}}/g, sourceLang);
}

async function retransform(input: string, sourceLang: string, targetLang: string) {
  if (!input.trim()) return null;
  try {
    const { object } = await generateObject({
      model: transformModel,
      schema: CFLTResponseSchema,
      system: buildSystemPrompt(sourceLang, targetLang),
      prompt: input,
    });
    return object;
  } catch {
    return null;
  }
}

interface RepairCount { total: number; fixed: number; skipped: number; errors: number }

export async function POST(request: Request) {
  const userId = await getUserId(request);
  const body = await request.json().catch(() => ({}));
  const scope: string = body.scope ?? 'all';

  const summary: Record<string, RepairCount> = {
    transforms: { total: 0, fixed: 0, skipped: 0, errors: 0 },
    courses:    { total: 0, fixed: 0, skipped: 0, errors: 0 },
    roleplay:   { total: 0, fixed: 0, skipped: 0, errors: 0 },
  };

  // ── Transforms ────────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'transforms') {
    const transforms = await listTransformEvents(userId);
    summary.transforms.total = transforms.length;
    const provider = providerFor(userId);

    for (const t of transforms) {
      if (!t.inputText) { summary.transforms.skipped++; continue; }
      try {
        const result = await retransform(t.inputText, t.sourceLang, t.targetLang);
        if (!result || 'error' in result) { summary.transforms.errors++; continue; }

        await provider.mutate<any>('events', t.eventId, (doc) => ({
          ...doc,
          data: { ...doc.data, cfltL1: result.cflt_l1, cfltL2: result.cflt_l2 },
        }));
        summary.transforms.fixed++;
      } catch {
        summary.transforms.errors++;
      }
    }
  }

  // ── Course manifests ───────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'courses') {
    const packages = await listPackages(userId);
    summary.courses.total = packages.reduce(
      (n, { manifest }) =>
        n + manifest.lessons.reduce((m, l) => m + l.scripts.length, 0),
      0,
    );

    for (const { slug, manifest } of packages) {
      let changed = false;
      for (const lesson of manifest.lessons) {
        for (const script of lesson.scripts) {
          const l1Input = script.standardL1?.trim();
          const l2Input = script.standardL2?.trim();
          if (!l1Input && !l2Input) { summary.courses.skipped++; continue; }
          try {
            if (l1Input) {
              // Normal path: source-lang sentence → transform → store directly
              const result = await retransform(l1Input, manifest.sourceLang, manifest.targetLang);
              if (!result || 'error' in result) { summary.courses.errors++; continue; }
              script.cfltL1 = result.cflt_l1;
              script.cfltL2 = result.cflt_l2;
            } else {
              // Fallback: target-lang sentence → reverse transform → swap outputs.
              // transform(standardL2, targetLang, sourceLang) produces:
              //   cflt_l1 = CRST in targetLang  → becomes script.cfltL2
              //   cflt_l2 = CRST in sourceLang  → becomes script.cfltL1
              const result = await retransform(l2Input!, manifest.targetLang, manifest.sourceLang);
              if (!result || 'error' in result) { summary.courses.errors++; continue; }
              script.cfltL1 = result.cflt_l2;
              script.cfltL2 = result.cflt_l1;
            }
            changed = true;
            summary.courses.fixed++;
          } catch {
            summary.courses.errors++;
          }
        }
      }
      if (changed) {
        const mPath = manifestPath(userId, slug);
        await fsPromises.writeFile(mPath, JSON.stringify(manifest, null, 2));
      }
    }
  }

  // ── Roleplay messages ──────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'roleplay') {
    const sessions = await listRoleplaySessions(userId);
    const provider = providerFor(userId);

    for (const session of sessions) {
      for (const msg of session.messages) {
        const hasUserCrst  = !!msg.userAnalysis?.crst;
        const hasCoachCrst = !!msg.coachAnalysis?.crst;
        if (!hasUserCrst && !hasCoachCrst) continue;

        summary.roleplay.total++;
        const content = msg.content?.trim();
        if (!content) { summary.roleplay.skipped++; continue; }

        try {
          // User messages: content is in sourceLang
          // Coach messages: content is in targetLang (swap the direction)
          const [src, tgt] = msg.role === 'user'
            ? [session.sourceLang, session.targetLang]
            : [session.targetLang, session.sourceLang];

          const result = await retransform(content, src, tgt);
          if (!result || 'error' in result || !result.slots) {
            summary.roleplay.errors++;
            continue;
          }

          const coreSlot = result.slots.find((s) => s.type === 'core');
          if (!coreSlot) { summary.roleplay.errors++; continue; }

          await provider.mutate<any>('events', msg.eventId, (doc) => {
            const data = { ...doc.data };
            if (hasUserCrst && data.userAnalysis?.crst) {
              data.userAnalysis = {
                ...data.userAnalysis,
                crst: {
                  ...data.userAnalysis.crst,
                  core: { content: coreSlot.content_l1, is_inferred: coreSlot.is_inferred },
                },
              };
            }
            if (hasCoachCrst && data.coachAnalysis?.crst) {
              data.coachAnalysis = {
                ...data.coachAnalysis,
                crst: {
                  ...data.coachAnalysis.crst,
                  core: { content: coreSlot.content_l1, is_inferred: coreSlot.is_inferred },
                },
              };
            }
            return { ...doc, data };
          });
          summary.roleplay.fixed++;
        } catch {
          summary.roleplay.errors++;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, summary });
}
